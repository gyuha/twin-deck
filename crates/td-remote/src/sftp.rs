//! SFTP 세션(SSH 비밀번호 인증). 비동기 `russh`/`russh-sftp`를 크레이트 안 런타임으로 감춰 블로킹 API로 쓴다.
//!
//! 비밀번호 인증 전에 앱 전용 저장소의 공개 호스트 키를 검증한다.

use std::future::Future;
use std::io::{self, Read, Write};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use russh::client;
use russh_sftp::client::error::Error as SftpError;
use russh_sftp::client::fs::File;
use russh_sftp::client::SftpSession as RawSftp;
use russh_sftp::protocol::{FileType, StatusCode};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::runtime::Runtime;

/// 런타임을 비동기 문맥 안에서 버려도 패닉하지 않게 백그라운드로 종료한다.
pub(crate) struct Rt(pub(crate) Option<Runtime>);

impl std::ops::Deref for Rt {
    type Target = Runtime;
    fn deref(&self) -> &Runtime {
        self.0.as_ref().expect("runtime")
    }
}

impl Drop for Rt {
    fn drop(&mut self) {
        if let Some(rt) = self.0.take() {
            rt.shutdown_background();
        }
    }
}

use crate::{
    file_name, is_plain_name, join, RemoteEntry, RemoteError, RemoteKind, RemoteSession,
    RemoteWrite, Result,
};

pub(crate) const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone)]
pub struct SftpConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub host_key: HostKeyPolicy,
}

/// 사용자에게 보여 준 실제 공개 키와 접속 대상. 변경된 키는 승인할 수 없다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostKeyChallenge {
    pub host: String,
    pub port: u16,
    pub algorithm: String,
    pub fingerprint: String,
    pub public_key: String,
    pub previous_fingerprint: Option<String>,
}

/// 기본값은 거부다. 승인은 한 번의 접속에만 적용되며 실제 교환한 키와 같아야 한다.
#[derive(Debug, Clone, Default)]
pub struct HostKeyPolicy {
    pub directory: Option<std::path::PathBuf>,
    pub approved_key: Option<String>,
}

fn trust_error(e: impl std::fmt::Display) -> RemoteError {
    RemoteError::Other(format!("SFTP 신뢰 키 저장소 오류(인증 중단): {e}"))
}

impl HostKeyPolicy {
    fn verify(&self, host: &str, port: u16, key: &russh::keys::PublicKey) -> Result<()> {
        let public_key = key.to_openssh().map_err(trust_error)?;
        let directory = self
            .directory
            .as_ref()
            .ok_or_else(|| trust_error("저장 경로 없음"))?;
        // 호스트 문자열을 파일 경로로 해석하지 않는다. 사용자 이름과 설정 저장 위치에는 독립적이다.
        let host_id: String = host
            .to_ascii_lowercase()
            .bytes()
            .map(|b| format!("{b:02x}"))
            .collect();
        let path = directory.join(format!("{host_id}-{port}.pub"));
        let existing = match std::fs::read_to_string(&path) {
            Ok(saved) => Some(saved),
            Err(e) if e.kind() == io::ErrorKind::NotFound => None,
            Err(e) => return Err(trust_error(e)),
        };
        if existing.as_deref() == Some(&public_key) {
            return Ok(());
        }
        let previous_fingerprint = existing
            .as_ref()
            .map(|saved| {
                russh::keys::PublicKey::from_openssh(saved)
                    .map(|k| k.fingerprint(russh::keys::HashAlg::Sha256).to_string())
                    .map_err(trust_error)
            })
            .transpose()?;
        let challenge = HostKeyChallenge {
            host: host.into(),
            port,
            algorithm: key.algorithm().to_string(),
            fingerprint: key.fingerprint(russh::keys::HashAlg::Sha256).to_string(),
            public_key: public_key.clone(),
            previous_fingerprint,
        };
        if existing.is_some() || self.approved_key.as_deref() != Some(&public_key) {
            return Err(RemoteError::HostKey(Box::new(challenge)));
        }
        std::fs::create_dir_all(directory).map_err(trust_error)?;
        let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(trust_error)?;
        temp.write_all(public_key.as_bytes()).map_err(trust_error)?;
        temp.as_file().sync_all().map_err(trust_error)?;
        // 원자적으로 처음 키만 등록한다. 동시에 다른 키가 등록되어도 덮어쓰지 않는다.
        match temp.persist_noclobber(&path) {
            Ok(_) => Ok(()),
            Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => {
                if std::fs::read_to_string(path).map_err(trust_error)? == public_key {
                    Ok(())
                } else {
                    Err(trust_error(
                        "동시에 다른 키가 등록됨; 다시 연결하여 확인하세요",
                    ))
                }
            }
            Err(e) => Err(trust_error(e)),
        }
    }
}

pub(crate) struct Client {
    host: String,
    port: u16,
    policy: HostKeyPolicy,
    failure: Arc<std::sync::Mutex<Option<RemoteError>>>,
}

/// 접속 설정으로 호스트 키 검증 핸들러를 만든다. SFTP와 원격 셸이 같은 신뢰 검사를 거치게 한다.
/// 두 번째 값은 검증이 거부한 이유를 접속 오류로 되돌려 받는 자리다.
pub(crate) fn client_for(cfg: &SftpConfig) -> (Client, Arc<std::sync::Mutex<Option<RemoteError>>>) {
    let failure = Arc::new(std::sync::Mutex::new(None));
    let client = Client {
        host: cfg.host.clone(),
        port: cfg.port,
        policy: cfg.host_key.clone(),
        failure: failure.clone(),
    };
    (client, failure)
}

impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> std::result::Result<bool, Self::Error> {
        // 인증서 CA 신뢰는 지원하지 않는다. 인증서를 일반 키로 축약하여 신뢰하지 않는다.
        let result = if server_public_key.certificate().is_some() {
            Err(trust_error("SSH 호스트 인증서는 지원하지 않습니다"))
        } else {
            self.policy
                .verify(&self.host, self.port, &server_public_key.public_key())
        };
        match result {
            Ok(()) => Ok(true),
            Err(e) => {
                *self.failure.lock().unwrap() = Some(e);
                Ok(false)
            }
        }
    }
}

pub struct SftpSession {
    rt: Arc<Rt>,
    sftp: Arc<RawSftp>,
    // 연결을 살려 두려고 들고 있고, 끊겼는지(`is_alive`) 물어보는 데도 쓴다.
    handle: client::Handle<Client>,
}

fn map_sftp(path: &str, e: SftpError) -> RemoteError {
    match e {
        SftpError::Status(s) => match s.status_code {
            StatusCode::NoSuchFile => RemoteError::NotFound(path.to_string()),
            _ => RemoteError::Other(format!("{}: {}", s.status_code, s.error_message)),
        },
        SftpError::Timeout => RemoteError::Unreachable,
        other => RemoteError::Other(other.to_string()),
    }
}

pub(crate) fn map_ssh(e: russh::Error) -> RemoteError {
    match e {
        russh::Error::IO(_)
        | russh::Error::Disconnect
        | russh::Error::HUP
        | russh::Error::ConnectionTimeout => RemoteError::Unreachable,
        other => RemoteError::Other(other.to_string()),
    }
}

/// 비동기 작업을 호출 스레드에서 끝날 때까지 기다린다. 이미 tokio 런타임 안이면
/// 중첩 `block_on` 패닉을 피하려고 새 스레드에서 실행한다.
pub(crate) fn block<T: Send>(rt: &Runtime, fut: impl Future<Output = T> + Send) -> T {
    if tokio::runtime::Handle::try_current().is_ok() {
        std::thread::scope(|s| {
            s.spawn(|| rt.block_on(fut))
                .join()
                .expect("remote worker thread")
        })
    } else {
        rt.block_on(fut)
    }
}

impl SftpSession {
    /// 접속하고 비밀번호로 인증한다. 실패하면 `Auth`(자격 증명)나 `Unreachable`(연결).
    pub fn connect(cfg: SftpConfig) -> Result<Self> {
        let rt = Arc::new(Rt(Some(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .map_err(|e| RemoteError::Other(e.to_string()))?,
        )));
        let (handle, sftp) = block(&rt, async {
            let config = Arc::new(client::Config::default());
            let (handler, failure) = client_for(&cfg);
            let mut handle = tokio::time::timeout(
                TIMEOUT,
                client::connect(config, (cfg.host.as_str(), cfg.port), handler),
            )
            .await
            .map_err(|_| RemoteError::Unreachable)?
            .map_err(|e| failure.lock().unwrap().take().unwrap_or_else(|| map_ssh(e)))?;
            let auth = handle
                .authenticate_password(cfg.user.as_str(), cfg.password.as_str())
                .await
                .map_err(map_ssh)?;
            if !auth.success() {
                return Err(RemoteError::Auth);
            }
            let channel = handle.channel_open_session().await.map_err(map_ssh)?;
            channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(map_ssh)?;
            let sftp = RawSftp::new(channel.into_stream())
                .await
                .map_err(|e| map_sftp("/", e))?;
            Ok((handle, sftp))
        })?;
        Ok(Self {
            rt,
            sftp: Arc::new(sftp),
            handle,
        })
    }

    fn run<T: Send>(
        &self,
        path: &str,
        fut: impl Future<Output = std::result::Result<T, SftpError>> + Send,
    ) -> Result<T> {
        block(&self.rt, fut).map_err(|e| map_sftp(path, e))
    }
}

fn kind_of(t: FileType) -> RemoteKind {
    match t {
        FileType::Dir => RemoteKind::Dir,
        FileType::Symlink => RemoteKind::Symlink,
        _ => RemoteKind::File,
    }
}

fn modified_of(m: &russh_sftp::protocol::FileAttributes) -> Option<SystemTime> {
    m.modified().ok().filter(|t| *t > SystemTime::UNIX_EPOCH)
}

impl RemoteSession for SftpSession {
    fn is_alive(&self) -> bool {
        !self.handle.is_closed()
    }

    fn home(&self) -> Result<String> {
        self.run("/", self.sftp.canonicalize("."))
    }

    fn list(&self, dir: &str) -> Result<Vec<RemoteEntry>> {
        let rd = self.run(dir, self.sftp.read_dir(dir.to_string()))?;
        Ok(rd
            // 서버가 준 이름은 믿지 않는다: `../x` 같은 이름이 복사 때 대상 폴더 밖에 쓰지 않게 평범한 이름만 남긴다.
            .filter(|e| is_plain_name(&e.file_name()))
            .map(|e| {
                let m = e.metadata();
                RemoteEntry {
                    name: e.file_name(),
                    kind: kind_of(e.file_type()),
                    size: m.len(),
                    modified: modified_of(&m),
                }
            })
            .collect())
    }

    fn stat(&self, path: &str) -> Result<RemoteEntry> {
        let m = self.run(path, self.sftp.metadata(path.to_string()))?;
        Ok(RemoteEntry {
            name: file_name(path).unwrap_or("/").to_string(),
            kind: kind_of(m.file_type()),
            size: m.len(),
            modified: modified_of(&m),
        })
    }

    fn mkdir_all(&self, path: &str) -> Result<()> {
        let mut cur = String::new();
        for part in path.split('/').filter(|p| !p.is_empty()) {
            cur = join(if cur.is_empty() { "/" } else { &cur }, part);
            if let Err(e) = self.run(&cur, self.sftp.create_dir(cur.clone())) {
                match self.stat(&cur) {
                    Ok(x) if x.kind == RemoteKind::Dir => {}
                    _ => return Err(e),
                }
            }
        }
        Ok(())
    }

    fn create_empty(&self, path: &str) -> Result<()> {
        if self.stat(path).is_ok() {
            return Err(RemoteError::AlreadyExists(path.to_string()));
        }
        self.write(path)?.finish()
    }

    fn rename(&self, from: &str, to: &str) -> Result<()> {
        self.run(from, self.sftp.rename(from.to_string(), to.to_string()))
    }

    fn remove_file(&self, path: &str) -> Result<()> {
        self.run(path, self.sftp.remove_file(path.to_string()))
    }

    fn remove_dir_all(&self, path: &str) -> Result<()> {
        for e in self.list(path)? {
            let child = join(path, &e.name);
            if e.kind == RemoteKind::Dir {
                self.remove_dir_all(&child)?;
            } else {
                self.remove_file(&child)?;
            }
        }
        self.run(path, self.sftp.remove_dir(path.to_string()))
    }

    fn read(&self, path: &str) -> Result<Box<dyn Read + Send>> {
        let file = self.run(path, self.sftp.open(path.to_string()))?;
        Ok(Box::new(SftpReader {
            rt: self.rt.clone(),
            file,
        }))
    }

    fn write(&self, path: &str) -> Result<Box<dyn RemoteWrite>> {
        let file = self.run(path, self.sftp.create(path.to_string()))?;
        Ok(Box::new(SftpWriter {
            rt: self.rt.clone(),
            file,
            path: path.to_string(),
        }))
    }
}

struct SftpReader {
    rt: Arc<Rt>,
    file: File,
}

impl Read for SftpReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let file = &mut self.file;
        block(&self.rt, file.read(buf))
    }
}

struct SftpWriter {
    rt: Arc<Rt>,
    file: File,
    path: String,
}

impl Write for SftpWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let file = &mut self.file;
        block(&self.rt, file.write(buf))
    }
    fn flush(&mut self) -> io::Result<()> {
        let file = &mut self.file;
        block(&self.rt, file.flush())
    }
}

impl RemoteWrite for SftpWriter {
    fn finish(mut self: Box<Self>) -> Result<()> {
        let file = &mut self.file;
        block(&self.rt, file.shutdown())
            .map_err(|e| RemoteError::Other(format!("{}: {e}", self.path)))
    }
}

#[cfg(test)]
mod trust_tests {
    use super::*;

    #[test]
    fn 서로_다른_키의_동시_승인은_하나만_저장하고_나머지는_거부한다() {
        let directory = tempfile::tempdir().unwrap();
        let a = russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)
            .unwrap();
        let b = russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519)
            .unwrap();
        let barrier = std::sync::Barrier::new(2);
        std::thread::scope(|scope| {
            let verify = |key: &russh::keys::PublicKey| {
                let policy = HostKeyPolicy {
                    directory: Some(directory.path().into()),
                    approved_key: Some(key.to_openssh().unwrap()),
                };
                barrier.wait();
                policy.verify("fake.test", 22, key)
            };
            let a_key = a.public_key();
            let b_key = b.public_key();
            let first = scope.spawn(move || verify(a_key));
            let second = scope.spawn(move || verify(b_key));
            assert_ne!(
                first.join().unwrap().is_ok(),
                second.join().unwrap().is_ok()
            );
        });
        let saved =
            std::fs::read_to_string(directory.path().join("66616b652e74657374-22.pub")).unwrap();
        assert!(
            saved == a.public_key().to_openssh().unwrap()
                || saved == b.public_key().to_openssh().unwrap()
        );
    }
}
