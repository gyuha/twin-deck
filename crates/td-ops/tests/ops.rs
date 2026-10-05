mod common;

use common::*;
use td_ops::{ConflictPolicy, Outcome};

#[test]
fn mkdir_nested_and_touch() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("x/y/z")).unwrap();
    assert!(f.a.join("x/y/z").as_path().is_dir());
    f.ops.touch(&f.a.join("new.txt")).unwrap();
    assert_eq!(read(&f.a.join("new.txt")), "");
    assert!(f.ops.touch(&f.a.join("new.txt")).is_err());
}

#[test]
fn copy_dir_recursive() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d/sub")).unwrap();
    write(&f.a.join("d/sub/f.txt"), "hi");
    write(&f.a.join("d/.hidden"), "h");
    let out = f
        .ops
        .copy(&f.a.join("d"), &f.b, ConflictPolicy::Skip)
        .unwrap();
    assert_eq!(out, Outcome::Done(f.b.join("d")));
    assert_eq!(read(&f.b.join("d/sub/f.txt")), "hi");
    assert_eq!(read(&f.b.join("d/.hidden")), "h");
    assert!(f.a.join("d/sub/f.txt").as_path().exists());
}

#[cfg(unix)]
#[test]
fn copy_keeps_symlink_as_link() {
    let f = fixture();
    write(&f.a.join("t.txt"), "t");
    std::os::unix::fs::symlink("t.txt", f.a.join("ln").as_path()).unwrap();
    f.ops
        .copy(&f.a.join("ln"), &f.b, ConflictPolicy::Skip)
        .unwrap();
    let meta = std::fs::symlink_metadata(f.b.join("ln").as_path()).unwrap();
    assert!(meta.file_type().is_symlink());
}

#[test]
fn copy_into_own_child_rejected() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d/inner")).unwrap();
    let err = f
        .ops
        .copy(&f.a.join("d"), &f.a.join("d/inner"), ConflictPolicy::Rename)
        .unwrap_err();
    assert!(matches!(err, td_ops::OpsError::DestInsideSource(_)));
}

#[test]
fn conflict_overwrite() {
    let f = fixture();
    write(&f.a.join("x.txt"), "new");
    write(&f.b.join("x.txt"), "old");
    assert!(f.ops.detect_conflict(&f.a.join("x.txt"), &f.b).is_some());
    f.ops
        .copy(&f.a.join("x.txt"), &f.b, ConflictPolicy::Overwrite)
        .unwrap();
    assert_eq!(read(&f.b.join("x.txt")), "new");
}

#[test]
fn conflict_overwrite_same_file_refused_and_data_kept() {
    let f = fixture();
    write(&f.a.join("x.txt"), "keep");
    let err = f
        .ops
        .copy(&f.a.join("x.txt"), &f.a, ConflictPolicy::Overwrite)
        .unwrap_err();
    assert!(matches!(err, td_ops::OpsError::SameFile(_)));
    assert_eq!(read(&f.a.join("x.txt")), "keep");
}

#[test]
fn conflict_skip() {
    let f = fixture();
    write(&f.a.join("x.txt"), "new");
    write(&f.b.join("x.txt"), "old");
    let out = f
        .ops
        .copy(&f.a.join("x.txt"), &f.b, ConflictPolicy::Skip)
        .unwrap();
    assert_eq!(out, Outcome::Skipped);
    assert_eq!(read(&f.b.join("x.txt")), "old");
}

#[test]
fn conflict_rename() {
    let f = fixture();
    write(&f.a.join("x.txt"), "new");
    write(&f.b.join("x.txt"), "old");
    write(&f.b.join("x (1).txt"), "old1");
    let out = f
        .ops
        .copy(&f.a.join("x.txt"), &f.b, ConflictPolicy::Rename)
        .unwrap();
    assert_eq!(out, Outcome::Done(f.b.join("x (2).txt")));
    assert_eq!(read(&f.b.join("x.txt")), "old");
    assert_eq!(read(&f.b.join("x (2).txt")), "new");
}

#[test]
fn move_and_rename() {
    let f = fixture();
    write(&f.a.join("x.txt"), "m");
    f.ops
        .move_to(&f.a.join("x.txt"), &f.b, ConflictPolicy::Skip)
        .unwrap();
    assert!(!f.a.join("x.txt").as_path().exists());
    let renamed = f.ops.rename(&f.b.join("x.txt"), "y.txt").unwrap();
    assert_eq!(read(&renamed), "m");
    assert!(f.ops.rename(&renamed, "a/b").is_err());
    write(&f.b.join("z.txt"), "z");
    assert!(f.ops.rename(&renamed, "z.txt").is_err());
}

#[test]
fn trash_moves_to_trash() {
    let f = fixture();
    write(&f.a.join("t.txt"), "t");
    f.ops.trash(&f.a.join("t.txt")).unwrap();
    assert!(!f.a.join("t.txt").as_path().exists());
    assert!(f.bin.join("t.txt").exists());
    assert!(f.ops.trash(&f.a.join("missing")).is_err());
}

#[test]
fn permanent_delete() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d/e")).unwrap();
    write(&f.a.join("d/e/f"), "1");
    write(&f.a.join("g"), "2");
    f.ops.delete(&f.a.join("d")).unwrap();
    f.ops.delete(&f.a.join("g")).unwrap();
    assert!(!f.a.join("d").as_path().exists());
    assert!(!f.a.join("g").as_path().exists());
    assert!(f.bin.read_dir().unwrap().next().is_none());
}

struct StopAfter(std::cell::Cell<usize>);

impl td_ops::Control for StopAfter {
    fn on_item(&self, _p: &td_vfs::VfsPath) {
        self.0.set(self.0.get() + 1);
    }
    fn should_stop(&self) -> bool {
        self.0.get() >= 2
    }
}

#[test]
fn copy_with_control_reports_items_and_can_stop() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    for n in ["1", "2", "3", "4"] {
        write(&f.a.join(&format!("d/{n}")), n);
    }
    let ctl = StopAfter(std::cell::Cell::new(0));
    let err = f
        .ops
        .copy_with(&f.a.join("d"), &f.b, ConflictPolicy::Skip, &ctl)
        .unwrap_err();
    assert!(matches!(err, td_ops::OpsError::Aborted));
    assert_eq!(ctl.0.get(), 2, "폴더 1개 + 파일 1개까지만 처리");
}

#[test]
fn duplicate_suffix() {
    use td_ops::duplicate_name;
    let none = |_: &str| false;
    assert_eq!(duplicate_name("a.txt", none), "a copy.txt");
    assert_eq!(
        duplicate_name("archive.tar.gz", none),
        "archive.tar copy.gz"
    );
    assert_eq!(duplicate_name("dir", none), "dir copy");
    assert_eq!(
        duplicate_name(".env", none),
        ".env copy",
        "맨 앞 점은 확장자가 아니다"
    );
    assert_eq!(duplicate_name("noext.", none), "noext copy.");
    let taken = |c: &str| c == "a copy.txt" || c == "a copy 2.txt";
    assert_eq!(duplicate_name("a.txt", taken), "a copy 3.txt");

    // 실제 복제: 파일, 반복, 폴더(재귀)
    let f = fixture();
    write(&f.a.join("a.txt"), "data");
    assert_eq!(
        f.ops.duplicate(&f.a.join("a.txt")).unwrap(),
        f.a.join("a copy.txt")
    );
    assert_eq!(
        f.ops.duplicate(&f.a.join("a.txt")).unwrap(),
        f.a.join("a copy 2.txt")
    );
    assert_eq!(read(&f.a.join("a copy 2.txt")), "data");
    assert_eq!(read(&f.a.join("a.txt")), "data", "원본은 그대로");

    f.ops.mkdir(&f.a.join("d/sub")).unwrap();
    write(&f.a.join("d/sub/x"), "x");
    let dup = f.ops.duplicate(&f.a.join("d")).unwrap();
    assert_eq!(dup, f.a.join("d copy"));
    assert_eq!(read(&dup.join("sub/x")), "x");

    assert!(f.ops.duplicate(&f.a.join("missing")).is_err());
}

// --- 폴더 복사 중 항목 하나가 실패할 때 ---

use std::sync::Mutex;
use td_ops::{Control, Ops, OpsError};
use td_vfs::{Entry, Info, ListOptions, LocalFs, Vfs, VfsError, VfsPath};

/// 같은 볼륨이어도 이름 바꾸기가 실패하게 해서(다른 볼륨 이동처럼) 이동이 "복사 후 삭제"를 타게 하는 Vfs.
struct NoRenameFs;

impl Vfs for NoRenameFs {
    fn list(&self, dir: &VfsPath, opts: &ListOptions) -> td_vfs::Result<Vec<Entry>> {
        LocalFs.list(dir, opts)
    }
    fn stat(&self, path: &VfsPath) -> td_vfs::Result<Entry> {
        LocalFs.stat(path)
    }
    fn mkdir(&self, path: &VfsPath) -> td_vfs::Result<()> {
        LocalFs.mkdir(path)
    }
    fn create_file(&self, path: &VfsPath) -> td_vfs::Result<()> {
        LocalFs.create_file(path)
    }
    fn rename(&self, from: &VfsPath, _to: &VfsPath) -> td_vfs::Result<()> {
        Err(VfsError::Io {
            path: from.clone(),
            source: std::io::Error::other("cross-device"),
        })
    }
    fn remove_file(&self, path: &VfsPath) -> td_vfs::Result<()> {
        LocalFs.remove_file(path)
    }
    fn remove_dir_all(&self, path: &VfsPath) -> td_vfs::Result<()> {
        LocalFs.remove_dir_all(path)
    }
    fn copy_file(&self, from: &VfsPath, to: &VfsPath) -> td_vfs::Result<u64> {
        LocalFs.copy_file(from, to)
    }
    fn info(&self, path: &VfsPath) -> td_vfs::Result<Info> {
        LocalFs.info(path)
    }
    fn read_link(&self, path: &VfsPath) -> td_vfs::Result<VfsPath> {
        LocalFs.read_link(path)
    }
    fn symlink(&self, target: &VfsPath, link: &VfsPath, is_dir: bool) -> td_vfs::Result<()> {
        LocalFs.symlink(target, link, is_dir)
    }
    fn read_head(&self, path: &VfsPath, max: usize) -> td_vfs::Result<Vec<u8>> {
        LocalFs.read_head(path, max)
    }
}

/// 항목 하나가 실패해도 멈추지 않고 실패를 모아 두는 제어(작업 큐처럼).
#[derive(Default)]
struct Collect(Mutex<Vec<(String, String)>>);

impl Control for Collect {
    fn on_item(&self, _path: &VfsPath) {}
    fn should_stop(&self) -> bool {
        false
    }
    fn collects_errors(&self) -> bool {
        true
    }
    fn on_error(&self, path: &VfsPath, message: &str) {
        self.0
            .lock()
            .unwrap()
            .push((path.to_string(), message.to_string()));
    }
}

/// a.txt, b.txt(읽을 수 없음), c.txt가 든 폴더 `d`가 있는 tempdir.
#[cfg(unix)]
fn dir_with_unreadable_child() -> (tempfile::TempDir, VfsPath, VfsPath, std::path::PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let tmp = tempfile::tempdir().unwrap();
    let (src, dst) = (tmp.path().join("src"), tmp.path().join("dst"));
    std::fs::create_dir_all(src.join("d")).unwrap();
    std::fs::create_dir(&dst).unwrap();
    for f in ["a.txt", "b.txt", "c.txt"] {
        std::fs::write(src.join("d").join(f), f).unwrap();
    }
    let bad = src.join("d/b.txt");
    std::fs::set_permissions(&bad, std::fs::Permissions::from_mode(0o000)).unwrap();
    (tmp, VfsPath::new(src.join("d")), VfsPath::new(dst), bad)
}

#[cfg(unix)]
fn restore(bad: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(bad, std::fs::Permissions::from_mode(0o644)).unwrap();
}

#[cfg(unix)]
#[test]
fn copy_dir_collects_failed_children_and_keeps_going() {
    let (_tmp, d, dst, bad) = dir_with_unreadable_child();
    let ops = Ops::new(
        NoRenameFs,
        FakeTrash {
            bin: dst.as_path().to_path_buf(),
            trashed: Default::default(),
        },
    );
    let ctl = Collect::default();
    let out = ops.copy_with(&d, &dst, ConflictPolicy::Skip, &ctl).unwrap();
    restore(&bad);
    assert_eq!(out, Outcome::Done(dst.join("d")));
    let errors = ctl.0.lock().unwrap().clone();
    assert_eq!(errors.len(), 1, "{errors:?}");
    assert!(errors[0].0.ends_with("d/b.txt"));
    assert_eq!(read(&dst.join("d/a.txt")), "a.txt");
    assert_eq!(
        read(&dst.join("d/c.txt")),
        "c.txt",
        "실패한 파일 뒤의 파일도 복사된다"
    );
}

#[cfg(unix)]
#[test]
fn copy_dir_without_collector_stops_at_first_error() {
    let (_tmp, d, dst, bad) = dir_with_unreadable_child();
    let f = Ops::new(
        NoRenameFs,
        FakeTrash {
            bin: dst.as_path().to_path_buf(),
            trashed: Default::default(),
        },
    );
    let res = f.copy(&d, &dst, ConflictPolicy::Skip); // 큐가 아닌 직접 호출은 첫 오류를 그대로 돌려준다
    restore(&bad);
    assert!(res.is_err());
}

#[cfg(unix)]
#[test]
fn move_dir_keeps_source_when_some_files_fail_to_copy() {
    let (_tmp, d, dst, bad) = dir_with_unreadable_child();
    let ops = Ops::new(
        NoRenameFs,
        FakeTrash {
            bin: dst.as_path().to_path_buf(),
            trashed: Default::default(),
        },
    );
    let ctl = Collect::default();
    let res = ops.move_with(&d, &dst, ConflictPolicy::Skip, &ctl);
    restore(&bad);
    assert!(matches!(res, Err(OpsError::PartialCopy(1))), "{res:?}");
    // 복사하지 못한 파일이 있으면 원본을 지우지 않는다(지우면 b.txt를 잃는다).
    for f in ["a.txt", "b.txt", "c.txt"] {
        assert!(d.join(f).as_path().exists(), "{f}가 원본에서 사라졌다");
    }
}

/// 복사 중 처리한 바이트(처리한 값, 전체 크기)를 모으는 제어.
#[derive(Default)]
struct BytesLog(Mutex<Vec<(u64, u64)>>);

impl Control for BytesLog {
    fn on_item(&self, _path: &VfsPath) {}
    fn should_stop(&self) -> bool {
        false
    }
    fn bytes_sink(&self) -> Option<Box<dyn Fn(u64, u64) + Send + '_>> {
        Some(Box::new(|done, total| {
            self.0.lock().unwrap().push((done, total))
        }))
    }
}

#[test]
fn copy_reports_bytes_monotonic_and_ends_at_file_size() {
    let f = fixture();
    let size = 3 * 1024 * 1024;
    std::fs::write(f.a.join("big.bin").as_path(), vec![7u8; size]).unwrap();
    let log = BytesLog::default();
    f.ops
        .copy_with(&f.a.join("big.bin"), &f.b, ConflictPolicy::Rename, &log)
        .unwrap();
    let log = log.0.into_inner().unwrap();
    assert!(!log.is_empty());
    assert!(log
        .iter()
        .all(|&(done, total)| total == size as u64 && done <= total));
    assert!(
        log.windows(2).all(|w| w[0].0 <= w[1].0),
        "단조 증가: {log:?}"
    );
    assert_eq!(log.last().unwrap().0, size as u64);
}

#[test]
fn copy_reports_bytes_for_small_file_too() {
    let f = fixture();
    std::fs::write(f.a.join("s.txt").as_path(), b"hello").unwrap();
    let log = BytesLog::default();
    f.ops
        .copy_with(&f.a.join("s.txt"), &f.b, ConflictPolicy::Rename, &log)
        .unwrap();
    assert_eq!(log.0.into_inner().unwrap().last(), Some(&(5, 5)));
}
