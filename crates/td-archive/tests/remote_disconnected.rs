//! 끊긴 원격 세션으로 작업하면 UI가 알아볼 수 있는 안정된 문구로 실패한다(이슈 #98).

use std::io::Read;
use std::sync::Arc;

use td_archive::{CompositeFs, REMOTE_DISCONNECTED};
use td_remote::{RemoteEntry, RemoteError, RemoteSession, RemoteWrite, Result};
use td_vfs::{Vfs, VfsError, VfsPath};

/// `alive`만 정할 수 있는 시험용 세션. 다른 동작은 모두 연결 불가 오류다.
struct Stale {
    alive: bool,
}

impl RemoteSession for Stale {
    fn is_alive(&self) -> bool {
        self.alive
    }
    fn home(&self) -> Result<String> {
        Err(RemoteError::Unreachable)
    }
    fn list(&self, _: &str) -> Result<Vec<RemoteEntry>> {
        Err(RemoteError::Unreachable)
    }
    fn stat(&self, _: &str) -> Result<RemoteEntry> {
        Err(RemoteError::Unreachable)
    }
    fn mkdir_all(&self, _: &str) -> Result<()> {
        Err(RemoteError::Unreachable)
    }
    fn create_empty(&self, _: &str) -> Result<()> {
        Err(RemoteError::Unreachable)
    }
    fn rename(&self, _: &str, _: &str) -> Result<()> {
        Err(RemoteError::Unreachable)
    }
    fn remove_file(&self, _: &str) -> Result<()> {
        Err(RemoteError::Unreachable)
    }
    fn remove_dir_all(&self, _: &str) -> Result<()> {
        Err(RemoteError::Unreachable)
    }
    fn read(&self, _: &str) -> Result<Box<dyn Read + Send>> {
        Err(RemoteError::Unreachable)
    }
    fn write(&self, _: &str) -> Result<Box<dyn RemoteWrite>> {
        Err(RemoteError::Unreachable)
    }
}

fn message(e: VfsError) -> String {
    match e {
        VfsError::Other { message, .. } => message,
        other => panic!("Other가 아니다: {other:?}"),
    }
}

#[test]
fn 끊긴_세션은_재연결_안내_문구로_실패하고_세션이_없을_때와_구분된다() {
    let fs = CompositeFs::default();
    fs.remote_registry().insert(
        "s",
        Arc::new(Stale { alive: false }) as Arc<dyn RemoteSession>,
    );
    let dead = message(fs.stat(&VfsPath::new("sftp://s/a.txt")).unwrap_err());
    assert_eq!(dead, REMOTE_DISCONNECTED);
    assert_eq!(dead, "원격 연결이 끊어졌습니다");

    let missing = message(fs.stat(&VfsPath::new("sftp://nobody/a.txt")).unwrap_err());
    assert_eq!(missing, "원격 연결이 열려 있지 않습니다");
    assert_ne!(dead, missing);
}

#[test]
fn 살아_있는_세션의_오류는_끊김_문구로_바뀌지_않는다_재연결_안내() {
    let fs = CompositeFs::default();
    fs.remote_registry().insert(
        "s",
        Arc::new(Stale { alive: true }) as Arc<dyn RemoteSession>,
    );
    let err = fs.stat(&VfsPath::new("sftp://s/a.txt")).unwrap_err();
    assert_ne!(message(err), REMOTE_DISCONNECTED);
}
