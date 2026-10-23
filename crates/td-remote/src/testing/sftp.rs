//! 테스트용 가짜 SFTP 서버(russh 서버 + SFTP 서브시스템). 같은 프로세스에서 로컬 TCP로 뜬다(`testing` 기능).

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::{SftpConfig, SftpSession};
use russh::keys::{Algorithm, PrivateKey};
use russh::server::{Auth, ChannelOpenHandle, Msg, Server as _, Session};
use russh::{Channel, ChannelId};
use russh_sftp::protocol::{
    Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode, Version,
};

pub const USER: &str = "u";
pub const PASS: &str = "p";

/// 임시 폴더를 루트로 하는 가짜 SFTP 서버. 값이 버려지면 서버와 임시 폴더가 정리된다.
pub struct FakeSftp {
    pub port: u16,
    root: tempfile::TempDir,
    trust: tempfile::TempDir,
    pub public_key: String,
    pub auth_attempts: Arc<std::sync::atomic::AtomicUsize>,
    // 서버 런타임을 테스트가 끝날 때까지 살려 둔다.
    rt: Option<tokio::runtime::Runtime>,
}

impl Drop for FakeSftp {
    fn drop(&mut self) {
        // 비동기 테스트 안에서 버려도 패닉하지 않게 백그라운드로 종료한다.
        if let Some(rt) = self.rt.take() {
            rt.shutdown_background();
        }
    }
}

impl FakeSftp {
    pub fn start() -> Self {
        Self::start_with_inactivity(None)
    }

    /// 무활동 제한(`inactivity`)을 둔 서버. 그동안 아무 패킷도 받지 못하면 서버가 연결을 끊는다(keepalive 시험용).
    pub fn start_with_inactivity(inactivity: Option<std::time::Duration>) -> Self {
        let root = tempfile::tempdir().unwrap();
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();
        let std_listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = std_listener.local_addr().unwrap().port();
        std_listener.set_nonblocking(true).unwrap();
        let base = Arc::new(root.path().to_path_buf());
        let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap();
        let public_key = key.public_key().to_openssh().unwrap();
        let auth_attempts = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let attempts = auth_attempts.clone();
        let config = russh::server::Config {
            auth_rejection_time: std::time::Duration::from_millis(0),
            auth_rejection_time_initial: Some(std::time::Duration::from_millis(0)),
            keys: vec![key],
            inactivity_timeout: inactivity,
            ..Default::default()
        };
        rt.spawn(async move {
            let listener = tokio::net::TcpListener::from_std(std_listener).unwrap();
            let mut server = FakeServer { base, attempts };
            let _ = server.run_on_socket(Arc::new(config), &listener).await;
        });
        Self {
            port,
            root,
            trust: tempfile::tempdir().unwrap(),
            public_key,
            auth_attempts,
            rt: Some(rt),
        }
    }

    pub fn path(&self, rel: &str) -> PathBuf {
        self.root.path().join(rel)
    }

    pub fn cfg(&self, user: &str, pass: &str) -> SftpConfig {
        SftpConfig {
            host: "127.0.0.1".into(),
            port: self.port,
            user: user.into(),
            password: pass.into(),
            keepalive: Some(crate::KEEPALIVE_INTERVAL),
            host_key: crate::HostKeyPolicy {
                directory: Some(self.trust.path().into()),
                approved_key: Some(self.public_key.clone()),
            },
        }
    }

    pub fn connect(&self) -> SftpSession {
        SftpSession::connect(self.cfg(USER, PASS)).unwrap()
    }
}

#[derive(Clone)]
struct FakeServer {
    base: Arc<PathBuf>,
    attempts: Arc<std::sync::atomic::AtomicUsize>,
}

impl russh::server::Server for FakeServer {
    type Handler = SshHandler;
    fn new_client(&mut self, _: Option<std::net::SocketAddr>) -> SshHandler {
        SshHandler {
            base: self.base.clone(),
            attempts: self.attempts.clone(),
            channels: HashMap::new(),
        }
    }
}

struct SshHandler {
    base: Arc<PathBuf>,
    attempts: Arc<std::sync::atomic::AtomicUsize>,
    channels: HashMap<ChannelId, Channel<Msg>>,
}

impl russh::server::Handler for SshHandler {
    type Error = anyhow::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        self.attempts
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if user == USER && password == PASS {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            })
        }
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.channels.insert(channel.id(), channel);
        reply.accept().await;
        Ok(())
    }

    async fn channel_eof(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.close(channel)?;
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        channel_id: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        if name == "sftp" {
            let channel = self.channels.remove(&channel_id).unwrap();
            session.channel_success(channel_id)?;
            let sftp = SftpHandler {
                base: self.base.to_path_buf(),
                handles: HashMap::new(),
                next: 0,
            };
            russh_sftp::server::run(channel.into_stream(), sftp).await;
        } else {
            session.channel_failure(channel_id)?;
        }
        Ok(())
    }
}

enum Open {
    File(fs::File),
    Dir(PathBuf, bool),
}

struct SftpHandler {
    base: PathBuf,
    handles: HashMap<String, Open>,
    next: u32,
}

fn ok(id: u32) -> Status {
    Status {
        id,
        status_code: StatusCode::Ok,
        error_message: "Ok".into(),
        language_tag: "en-US".into(),
    }
}

fn code(e: &std::io::Error) -> StatusCode {
    match e.kind() {
        std::io::ErrorKind::NotFound => StatusCode::NoSuchFile,
        std::io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
        _ => StatusCode::Failure,
    }
}

impl SftpHandler {
    fn real(&self, virt: &str) -> PathBuf {
        let mut real = self.base.clone();
        let mut parts: Vec<&str> = Vec::new();
        for p in virt.split('/').filter(|p| !p.is_empty() && *p != ".") {
            if p == ".." {
                parts.pop();
            } else {
                parts.push(p);
            }
        }
        real.extend(parts);
        real
    }

    fn new_handle(&mut self, open: Open) -> String {
        self.next += 1;
        let h = format!("h{}", self.next);
        self.handles.insert(h.clone(), open);
        h
    }
}

fn attrs_of(p: &Path) -> Result<FileAttributes, StatusCode> {
    let m = fs::metadata(p).map_err(|e| code(&e))?;
    Ok(FileAttributes::from(&m))
}

impl russh_sftp::server::Handler for SftpHandler {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn init(&mut self, _v: u32, _e: HashMap<String, String>) -> Result<Version, Self::Error> {
        Ok(Version::new())
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        let mut parts: Vec<&str> = Vec::new();
        for p in path.split('/').filter(|p| !p.is_empty() && *p != ".") {
            if p == ".." {
                parts.pop();
            } else {
                parts.push(p);
            }
        }
        Ok(Name {
            id,
            files: vec![File::dummy(format!("/{}", parts.join("/")))],
        })
    }

    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        Ok(Attrs {
            id,
            attrs: attrs_of(&self.real(&path))?,
        })
    }

    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        self.stat(id, path).await
    }

    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        match self.handles.get(&handle) {
            Some(Open::File(f)) => Ok(Attrs {
                id,
                attrs: FileAttributes::from(&f.metadata().map_err(|e| code(&e))?),
            }),
            _ => Err(StatusCode::Failure),
        }
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        let real = self.real(&path);
        if !real.is_dir() {
            return Err(StatusCode::NoSuchFile);
        }
        Ok(Handle {
            id,
            handle: self.new_handle(Open::Dir(real, false)),
        })
    }

    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        let Some(Open::Dir(dir, done)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        if *done {
            return Err(StatusCode::Eof);
        }
        *done = true;
        let mut files = Vec::new();
        for e in fs::read_dir(&*dir).map_err(|e| code(&e))?.flatten() {
            let attrs = FileAttributes::from(&e.metadata().map_err(|e| code(&e))?);
            files.push(File::new(e.file_name().to_string_lossy(), attrs));
        }
        Ok(Name { id, files })
    }

    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        _a: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        let real = self.real(&filename);
        let f = fs::OpenOptions::from(pflags)
            .open(&real)
            .map_err(|e| code(&e))?;
        Ok(Handle {
            id,
            handle: self.new_handle(Open::File(f)),
        })
    }

    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        self.handles.remove(&handle);
        Ok(ok(id))
    }

    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, Self::Error> {
        let Some(Open::File(f)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        f.seek(SeekFrom::Start(offset)).map_err(|e| code(&e))?;
        let mut buf = vec![0u8; len as usize];
        let n = f.read(&mut buf).map_err(|e| code(&e))?;
        if n == 0 {
            return Err(StatusCode::Eof);
        }
        buf.truncate(n);
        Ok(Data { id, data: buf })
    }

    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, Self::Error> {
        let Some(Open::File(f)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        f.seek(SeekFrom::Start(offset)).map_err(|e| code(&e))?;
        f.write_all(&data).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, Self::Error> {
        fs::remove_file(self.real(&filename)).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn mkdir(
        &mut self,
        id: u32,
        path: String,
        _a: FileAttributes,
    ) -> Result<Status, Self::Error> {
        fs::create_dir(self.real(&path)).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        fs::remove_dir(self.real(&path)).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn rename(&mut self, id: u32, old: String, new: String) -> Result<Status, Self::Error> {
        fs::rename(self.real(&old), self.real(&new)).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn setstat(
        &mut self,
        id: u32,
        _p: String,
        _a: FileAttributes,
    ) -> Result<Status, Self::Error> {
        Ok(ok(id))
    }

    async fn fsetstat(
        &mut self,
        id: u32,
        _h: String,
        _a: FileAttributes,
    ) -> Result<Status, Self::Error> {
        Ok(ok(id))
    }
}
