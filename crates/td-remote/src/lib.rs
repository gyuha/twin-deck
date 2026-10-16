//! 원격 서버(SFTP·FTP)를 블로킹 세션으로 다루는 클라이언트 계층(ADR-0019).
//! 파일시스템(`td-vfs`)에는 의존하지 않는다. 경로는 서버 쪽 `/` 구분 문자열이다.

mod connect;
mod error;
mod ftp;
mod secret;
pub mod server;
mod sftp;
mod shell;
#[cfg(feature = "testing")]
pub mod testing;

use std::io::{Read, Write};
use std::time::SystemTime;

pub use connect::{
    connect_session, connect_session_verified, open_session, Protocol, RemoteTarget, SessionOpener,
};
pub use error::{RemoteError, Result};
pub use ftp::{FtpConfig, FtpSession};
pub use secret::{secret_key, KeyringStore, SecretStore, SECRET_SERVICE};
pub use sftp::{HostKeyChallenge, HostKeyPolicy, SftpConfig, SftpSession};
pub use shell::{ShellEvent, ShellSession};

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

/// 서버가 목록에서 돌려준 이름이 **한 구성 요소짜리 평범한 이름**인가.
/// 서버는 믿을 수 없다(악의적이거나 중간자일 수 있다). `../x`나 `/etc/x` 같은 이름을 그대로 쓰면 원격을 로컬로 복사할 때
/// `dest.join(name)`이 대상 폴더 밖에 쓴다(scp의 CVE-2019-6111과 같은 유형). 그래서 빈 이름, `.`, `..`, 경로 구분자(`/`),
/// NUL, 그리고 Windows에서는 `\`와 `:`(드라이브·경로 구분)를 담은 이름은 목록에서 뺀다.
pub fn is_plain_name(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']) {
        return false;
    }
    !(cfg!(windows) && name.contains(['\\', ':']))
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

#[cfg(test)]
mod tests {
    use super::is_plain_name;

    #[test]
    fn 평범한_이름만_통과한다() {
        for ok in ["a.txt", "한글 파일.md", ".hidden", "a b", "...", "x..y"] {
            assert!(is_plain_name(ok), "{ok:?}");
        }
    }

    #[test]
    fn 상위_경로와_절대_경로와_구분자_이름은_거른다() {
        for bad in [
            "",
            ".",
            "..",
            "../x",
            "../../etc/passwd",
            "/etc/passwd",
            "a/b",
            "a/",
            "/",
            "a\0b",
        ] {
            assert!(!is_plain_name(bad), "{bad:?}");
        }
    }
}
