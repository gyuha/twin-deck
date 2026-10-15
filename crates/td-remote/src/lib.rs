//! 원격 서버(SFTP·FTP)를 블로킹 세션으로 다루는 클라이언트 계층(ADR-0019).
//! 파일시스템(`td-vfs`)에는 의존하지 않는다. 경로는 서버 쪽 `/` 구분 문자열이다.

mod connect;
mod error;
mod ftp;
mod secret;
mod sftp;
#[cfg(feature = "testing")]
pub mod testing;

use std::io::{Read, Write};
use std::time::SystemTime;

pub use connect::{connect_session, open_session, Protocol, RemoteTarget, SessionOpener};
pub use error::{RemoteError, Result};
pub use ftp::{FtpConfig, FtpSession};
pub use secret::{secret_key, KeyringStore, SecretStore, SECRET_SERVICE};
pub use sftp::{SftpConfig, SftpSession};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteKind {
    File,
    Dir,
    Symlink,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteEntry {
    pub name: String,
    pub kind: RemoteKind,
    pub size: u64,
    pub modified: Option<SystemTime>,
}

/// 원격에 쓰는 스트림. 다 쓴 뒤 `finish`를 불러야 서버가 전송 완료를 확정한다.
pub trait RemoteWrite: Write + Send {
    fn finish(self: Box<Self>) -> Result<()>;
}

/// 열린 원격 세션. 스레드 사이에서 공유할 수 있다.
pub trait RemoteSession: Send + Sync {
    /// 로그인 직후의 기본 폴더(홈).
    fn home(&self) -> Result<String>;
    fn list(&self, dir: &str) -> Result<Vec<RemoteEntry>>;
    fn stat(&self, path: &str) -> Result<RemoteEntry>;
    /// 중첩 경로를 포함해 폴더를 만든다. 이미 있으면 그대로 성공한다.
    fn mkdir_all(&self, path: &str) -> Result<()>;
    /// 0바이트 파일을 만든다. 이미 있으면 `AlreadyExists`.
    fn create_empty(&self, path: &str) -> Result<()>;
    fn rename(&self, from: &str, to: &str) -> Result<()>;
    fn remove_file(&self, path: &str) -> Result<()>;
    fn remove_dir_all(&self, path: &str) -> Result<()>;
    /// 파일 내용을 처음부터 읽는 스트림.
    fn read(&self, path: &str) -> Result<Box<dyn Read + Send>>;
    /// 파일을 만들거나 덮어쓰는 스트림.
    fn write(&self, path: &str) -> Result<Box<dyn RemoteWrite>>;
}

/// `/a/b` + `c` → `/a/b/c`.
pub fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}

/// 마지막 구성 요소를 뗀 경로. 루트(`/`)의 부모는 없다.
pub fn parent(path: &str) -> Option<String> {
    let p = path.trim_end_matches('/');
    if p.is_empty() {
        return None;
    }
    match p.rfind('/') {
        Some(0) => Some("/".to_string()),
        Some(i) => Some(p[..i].to_string()),
        None => None,
    }
}

pub fn file_name(path: &str) -> Option<&str> {
    let p = path.trim_end_matches('/');
    p.rsplit('/').next().filter(|s| !s.is_empty())
}
