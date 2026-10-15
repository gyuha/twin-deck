//! SFTP 세션(SSH 비밀번호 인증). 비동기 `russh`/`russh-sftp`를 크레이트 안 런타임으로 감춰 블로킹 API로 쓴다.
//!
//! 호스트 키는 확인하지 않고 받아들인다(영구 신뢰 저장소 없음 — ADR-0019의 한계).

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
struct Rt(Option<Runtime>);

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

const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone)]
pub struct SftpConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}

struct Client;

impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> std::result::Result<bool, Self::Error> {
        Ok(true)
    }
}

pub struct SftpSession {
    rt: Arc<Rt>,
    sftp: Arc<RawSftp>,
    // 연결을 살려 두려고 들고 있는다.
    _handle: client::Handle<Client>,
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

fn map_ssh(e: russh::Error) -> RemoteError {
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
fn block<T: Send>(rt: &Runtime, fut: impl Future<Output = T> + Send) -> T {
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
            let mut handle = tokio::time::timeout(
                TIMEOUT,
                client::connect(config, (cfg.host.as_str(), cfg.port), Client),
            )
            .await
            .map_err(|_| RemoteError::Unreachable)?
            .map_err(map_ssh)?;
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
            _handle: handle,
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
