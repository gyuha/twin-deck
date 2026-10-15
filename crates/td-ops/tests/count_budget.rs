//! 폴더를 훑는 데 오래 걸리는 곳(원격)은 파일 수 집계에 시간 제한을 둔다.

use std::time::Duration;

use td_ops::{Ops, Trasher};
use td_vfs::{Entry, Info, ListOptions, LocalFs, Result, Vfs, VfsPath};

struct NoTrash;
impl Trasher for NoTrash {
    fn trash(&self, _: &std::path::Path) -> td_ops::Result<()> {
        Ok(())
    }
}

/// `LocalFs`를 감싸 폴더 목록마다 `delay`만큼 기다리는 느린 파일시스템.
struct Slow {
    inner: LocalFs,
    delay: Duration,
    slow: bool,
}

impl Vfs for Slow {
    fn list(&self, dir: &VfsPath, opts: &ListOptions) -> Result<Vec<Entry>> {
        std::thread::sleep(self.delay);
        self.inner.list(dir, opts)
    }
    fn stat(&self, p: &VfsPath) -> Result<Entry> {
        self.inner.stat(p)
    }
    fn mkdir(&self, p: &VfsPath) -> Result<()> {
        self.inner.mkdir(p)
    }
    fn create_file(&self, p: &VfsPath) -> Result<()> {
        self.inner.create_file(p)
    }
    fn rename(&self, a: &VfsPath, b: &VfsPath) -> Result<()> {
        self.inner.rename(a, b)
    }
    fn remove_file(&self, p: &VfsPath) -> Result<()> {
        self.inner.remove_file(p)
    }
    fn remove_dir_all(&self, p: &VfsPath) -> Result<()> {
        self.inner.remove_dir_all(p)
    }
    fn copy_file(&self, a: &VfsPath, b: &VfsPath) -> Result<u64> {
        self.inner.copy_file(a, b)
    }
    fn info(&self, p: &VfsPath) -> Result<Info> {
        self.inner.info(p)
    }
    fn read_link(&self, p: &VfsPath) -> Result<VfsPath> {
        self.inner.read_link(p)
    }
    fn symlink(&self, t: &VfsPath, l: &VfsPath, d: bool) -> Result<()> {
        self.inner.symlink(t, l, d)
    }
    fn read_head(&self, p: &VfsPath, max: usize) -> Result<Vec<u8>> {
        self.inner.read_head(p, max)
    }
    fn is_slow(&self, _: &VfsPath) -> bool {
        self.slow
    }
}

fn tree(dirs: usize) -> (tempfile::TempDir, VfsPath) {
    let t = tempfile::tempdir().unwrap();
    for i in 0..dirs {
        std::fs::create_dir(t.path().join(format!("d{i}"))).unwrap();
        std::fs::write(t.path().join(format!("d{i}/f.txt")), b"x").unwrap();
    }
    let root = VfsPath::new(t.path());
    (t, root)
}

fn ops(slow: bool) -> Ops<Slow, NoTrash> {
    Ops::new(
        Slow {
            inner: LocalFs,
            delay: Duration::from_millis(40),
            slow,
        },
        NoTrash,
    )
}

#[test]
fn 느린_곳은_제한_시간_안에_다_못_세면_none이다() {
    let (_t, root) = tree(30); // 목록 31번 × 40ms ≈ 1.2초
    assert_eq!(
        ops(true)
            .count_files_within(&root, Duration::from_millis(150))
            .unwrap(),
        None
    );
}

#[test]
fn 느린_곳도_제한_안에_세면_개수를_준다() {
    let (_t, root) = tree(3);
    assert_eq!(
        ops(true)
            .count_files_within(&root, Duration::from_secs(5))
            .unwrap(),
        Some(3)
    );
}

#[test]
fn 느리지_않은_곳은_시간_제한_없이_끝까지_센다() {
    let (_t, root) = tree(10);
    assert_eq!(
        ops(false)
            .count_files_within(&root, Duration::from_millis(1))
            .unwrap(),
        Some(10)
    );
}
