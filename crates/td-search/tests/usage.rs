use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

use td_archive::{CompositeFs, Source, ZipEdit};
use td_search::{
    crosses_volume, disk_usage, flatten, CancelToken, UsageItem, UsageOptions, UsageReport,
};
use td_vfs::{Entry, EntryKind, FileId, Info, ListOptions, LocalFs, Result, Vfs, VfsPath};

fn vp(p: &Path) -> VfsPath {
    VfsPath::new(p)
}

/// `LocalFs`를 감싸 목록 조회를 느리게 하거나 특정 폴더 아래의 장치 번호를 바꿔 보이게 하는 테스트용 Vfs.
struct Wrap {
    inner: LocalFs,
    list_delay: Duration,
    other_device: Option<PathBuf>,
}

impl Wrap {
    fn new() -> Self {
        Wrap {
            inner: LocalFs,
            list_delay: Duration::ZERO,
            other_device: None,
        }
    }

    fn adjust(&self, mut e: Entry) -> Entry {
        if let (Some(dir), Some(id)) = (&self.other_device, e.file_id.as_mut()) {
            if e.path.as_path().starts_with(dir) {
                id.dev = 999_999;
            }
        }
        e
    }
}

impl Vfs for Wrap {
    fn list(&self, dir: &VfsPath, opts: &ListOptions) -> Result<Vec<Entry>> {
        thread::sleep(self.list_delay);
        Ok(self
            .inner
            .list(dir, opts)?
            .into_iter()
            .map(|e| self.adjust(e))
            .collect())
    }
    fn stat(&self, path: &VfsPath) -> Result<Entry> {
        self.inner.stat(path).map(|e| self.adjust(e))
    }
    fn mkdir(&self, path: &VfsPath) -> Result<()> {
        self.inner.mkdir(path)
    }
    fn create_file(&self, path: &VfsPath) -> Result<()> {
        self.inner.create_file(path)
    }
    fn rename(&self, from: &VfsPath, to: &VfsPath) -> Result<()> {
        self.inner.rename(from, to)
    }
    fn remove_file(&self, path: &VfsPath) -> Result<()> {
        self.inner.remove_file(path)
    }
    fn remove_dir_all(&self, path: &VfsPath) -> Result<()> {
        self.inner.remove_dir_all(path)
    }
    fn copy_file(&self, from: &VfsPath, to: &VfsPath) -> Result<u64> {
        self.inner.copy_file(from, to)
    }
    fn info(&self, path: &VfsPath) -> Result<Info> {
        self.inner.info(path)
    }
    fn read_link(&self, path: &VfsPath) -> Result<VfsPath> {
        self.inner.read_link(path)
    }
    fn symlink(&self, target: &VfsPath, link: &VfsPath, is_dir: bool) -> Result<()> {
        self.inner.symlink(target, link, is_dir)
    }
    fn read_head(&self, path: &VfsPath, max: usize) -> Result<Vec<u8>> {
        self.inner.read_head(path, max)
    }
}

fn usage(
    vfs: &(impl Vfs + Sync),
    root: &Path,
    opts: &UsageOptions,
) -> (Vec<UsageItem>, UsageReport) {
    disk_usage(vfs, &vp(root), opts, &CancelToken::new(), &mut |_| {})
}

fn write(path: &Path, size: usize) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, vec![b'a'; size]).unwrap();
}

/// big/ = 1000 + 2000 + 500(중첩) = 3500, mid/ = 700, single.bin = 4000, empty/ = 0
fn build_sized_tree(root: &Path) {
    write(&root.join("big/a.bin"), 1000);
    write(&root.join("big/b.bin"), 2000);
    write(&root.join("big/nested/deep/c.bin"), 500);
    write(&root.join("mid/m.bin"), 700);
    write(&root.join("single.bin"), 4000);
    fs::create_dir(root.join("empty")).unwrap();
}

fn summary(items: &[UsageItem]) -> Vec<(&str, u64, u64, bool)> {
    items
        .iter()
        .map(|i| (i.name.as_str(), i.bytes, i.files, i.done))
        .collect()
}

#[test]
fn flatten_lists_files_only() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(&root.join("a.txt"), 1);
    write(&root.join("sub/b.txt"), 2);
    write(&root.join("sub/deep/c.txt"), 3);
    fs::create_dir(root.join("empty")).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        symlink(root.join("sub"), root.join("link_to_sub")).unwrap();
        symlink(".", root.join("loop")).unwrap(); // 자기 자신을 가리키는 순환 링크
        symlink("nowhere", root.join("broken")).unwrap();
    }

    let mut got: Vec<(String, EntryKind)> = Vec::new();
    let report = flatten(&LocalFs, &vp(root), &CancelToken::new(), &mut |e| {
        got.push((
            e.path
                .as_path()
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            e.kind,
        ))
    });
    got.sort_by(|a, b| a.0.cmp(&b.0));
    let mut expected = vec![
        ("a.txt".to_string(), EntryKind::File),
        ("sub/b.txt".to_string(), EntryKind::File),
        ("sub/deep/c.txt".to_string(), EntryKind::File),
    ];
    #[cfg(unix)]
    expected.extend([
        ("broken".to_string(), EntryKind::Symlink),
        ("link_to_sub".to_string(), EntryKind::Symlink),
        ("loop".to_string(), EntryKind::Symlink),
    ]);
    expected.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(got, expected); // 폴더(sub, deep, empty)는 없고, 링크는 링크 자체만이며 그 안으로 들어가지 않는다
    assert!(!report.cancelled);
    assert_eq!(report.visited as usize, got.len() + 3); // 폴더 3개도 훑기는 했다

    // 아카이브 안에서도 같다
    let zip = root.join("z.zip");
    let mut z = ZipEdit::create(&zip).unwrap();
    z.add_file("docs/x.txt", Source::Bytes(b"x".to_vec()));
    z.add_file("docs/deep/y.txt", Source::Bytes(b"yy".to_vec()));
    z.add_dir("emptydir");
    z.commit().unwrap();
    let mut in_zip = Vec::new();
    flatten(
        &CompositeFs::default(),
        &VfsPath::new(format!("{}!", zip.display())),
        &CancelToken::new(),
        &mut |e| in_zip.push((e.name.clone(), e.size)),
    );
    in_zip.sort();
    assert_eq!(in_zip, [("x.txt".to_string(), 1), ("y.txt".to_string(), 2)]);

    // 취소
    let cancel = CancelToken::new();
    let mut n = 0;
    let r = flatten(&LocalFs, &vp(root), &cancel, &mut |_| {
        n += 1;
        cancel.cancel();
    });
    assert_eq!((n, r.cancelled), (1, true));
}

#[test]
fn disk_usage_sizes() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    build_sized_tree(root);

    let expected = vec![
        ("single.bin", 4000, 1, true),
        ("big", 3500, 3, true),
        ("mid", 700, 1, true),
        ("empty", 0, 0, true),
    ];
    for threads in [1, 2, 4] {
        let opts = UsageOptions {
            threads,
            ..UsageOptions::default()
        };
        let (items, report) = usage(&LocalFs, root, &opts);
        assert_eq!(summary(&items), expected, "threads={threads}"); // 내림차순, 하위 합계 정확
        assert_eq!((report.total_bytes, report.total_files), (8200, 5));
        assert!(!report.cancelled);
        assert_eq!(
            report.unreadable + report.hardlinks_skipped + report.volume_skipped,
            0
        );
    }

    // 진행 중 스냅샷은 항상 내림차순이고, 마지막 스냅샷이 최종 결과와 같다
    let mut snaps: Vec<Vec<UsageItem>> = Vec::new();
    let slow = Wrap {
        list_delay: Duration::from_millis(5),
        ..Wrap::new()
    };
    let opts = UsageOptions {
        threads: 2,
        update_every: Duration::from_millis(5),
        ..UsageOptions::default()
    };
    let (items, _) = disk_usage(&slow, &vp(root), &opts, &CancelToken::new(), &mut |s| {
        snaps.push(s.to_vec())
    });
    assert!(
        snaps.len() >= 2,
        "진행 중 부분 결과가 와야 한다: {}",
        snaps.len()
    );
    for s in &snaps {
        assert!(s.windows(2).all(|w| w[0].bytes >= w[1].bytes));
    }
    assert_eq!(snaps.last().unwrap(), &items);
    // 부분 결과의 합은 줄어들지 않는다
    let totals: Vec<u64> = snaps
        .iter()
        .map(|s| s.iter().map(|i| i.bytes).sum())
        .collect();
    assert!(totals.windows(2).all(|w| w[0] <= w[1]), "{totals:?}");

    // 아카이브 안에서도 정확하다: 크기는 압축 해제 크기
    let zip = root.join("z.zip");
    let mut z = ZipEdit::create(&zip).unwrap();
    z.add_file("big/a.bin", Source::Bytes(vec![b'a'; 1000]));
    z.add_file("big/b.bin", Source::Bytes(vec![b'a'; 2000]));
    z.add_file("big/nested/deep/c.bin", Source::Bytes(vec![b'a'; 500]));
    z.add_file("mid/m.bin", Source::Bytes(vec![b'a'; 700]));
    z.add_file("single.bin", Source::Bytes(vec![b'a'; 4000]));
    z.add_dir("empty");
    z.commit().unwrap();
    let (items, report) = disk_usage(
        &CompositeFs::default(),
        &VfsPath::new(format!("{}!", zip.display())),
        &UsageOptions::default(),
        &CancelToken::new(),
        &mut |_| {},
    );
    assert_eq!(summary(&items), expected);
    assert_eq!(report.total_bytes, 8200);
}

#[cfg(unix)]
#[test]
fn disk_usage_hardlink_once() {
    use std::os::unix::fs::symlink;
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(&root.join("d1/f.bin"), 5000);
    fs::create_dir(root.join("d2")).unwrap();
    fs::hard_link(root.join("d1/f.bin"), root.join("d2/link.bin")).unwrap();
    fs::hard_link(root.join("d1/f.bin"), root.join("d1/again.bin")).unwrap();
    write(&root.join("plain.bin"), 100);
    // 심볼릭 링크는 따라가지 않는다: 링크 자체의 크기만 센다
    symlink(root.join("d1/f.bin"), root.join("sym")).unwrap();
    symlink(root.join("d1"), root.join("dirlink")).unwrap();

    for threads in [1, 4] {
        let opts = UsageOptions {
            threads,
            ..UsageOptions::default()
        };
        let (items, report) = usage(&LocalFs, root, &opts);
        let bytes = |name: &str| items.iter().find(|i| i.name == name).unwrap().bytes;
        // 하드 링크 3개(d1/f.bin, d1/again.bin, d2/link.bin) 중 한 번만 5000을 센다
        assert_eq!(bytes("d1") + bytes("d2"), 5000, "threads={threads}");
        assert_eq!(report.hardlinks_skipped, 2);
        assert_eq!(bytes("plain.bin"), 100);
        assert!(
            bytes("sym") < 4096 && bytes("dirlink") < 4096,
            "링크는 링크 자체 크기만"
        );
        let sym_files = items.iter().find(|i| i.name == "sym").unwrap().files;
        assert_eq!(sym_files, 1);
        assert_eq!(
            report.total_bytes,
            5000 + 100 + bytes("sym") + bytes("dirlink")
        );
    }
}

#[test]
fn disk_usage_cancel() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    const FILE: usize = 100;
    for d in 0..20 {
        for s in 0..5 {
            write(&root.join(format!("d{d:02}/s{s}/f.bin")), FILE);
        }
    }
    let slow = Wrap {
        list_delay: Duration::from_millis(10),
        ..Wrap::new()
    };
    let opts = UsageOptions {
        threads: 4,
        update_every: Duration::from_millis(10),
        ..UsageOptions::default()
    };

    // 전체를 끝까지 세면 얼마나 걸리고 얼마인지(기준선)
    let start = Instant::now();
    let (_, full) = disk_usage(&slow, &vp(root), &opts, &CancelToken::new(), &mut |_| {});
    let full_time = start.elapsed();
    assert_eq!(
        (full.total_files, full.total_bytes),
        (100, (100 * FILE) as u64)
    );

    // 첫 부분 결과에서 취소
    let cancel = CancelToken::new();
    let start = Instant::now();
    let (items, report) = disk_usage(&slow, &vp(root), &opts, &cancel, &mut |_| cancel.cancel());
    let cancelled_time = start.elapsed();
    assert!(report.cancelled);
    assert!(
        items.iter().any(|i| !i.done),
        "끝나지 않은 항목이 있어야 한다"
    );
    assert!(
        report.total_files < full.total_files,
        "{} / {}",
        report.total_files,
        full.total_files
    );
    assert!(
        cancelled_time < full_time / 2,
        "{cancelled_time:?} vs {full_time:?}"
    );
    // 부분 결과는 유효하다: 센 파일 수 × 파일 크기 = 센 바이트, 내림차순, 항목 수는 그대로
    assert_eq!(items.len(), 20);
    for i in &items {
        assert_eq!(i.bytes, i.files * FILE as u64, "{}", i.name);
        assert!(i.files <= 5);
        if i.done {
            assert_eq!(i.files, 5);
        }
    }
    assert!(items.windows(2).all(|w| w[0].bytes >= w[1].bytes));
    assert_eq!(
        report.total_bytes,
        items.iter().map(|i| i.bytes).sum::<u64>()
    );

    // 시작 전에 취소돼 있으면 아무것도 세지 않는다
    let pre = CancelToken::new();
    pre.cancel();
    let (items, report) = disk_usage(
        &LocalFs,
        &vp(root),
        &UsageOptions::default(),
        &pre,
        &mut |_| {},
    );
    assert_eq!((report.total_bytes, report.cancelled), (0, true));
    assert!(items.iter().all(|i| !i.done && i.bytes == 0));
}

#[cfg(unix)]
#[test]
fn disk_usage_volume_boundary_default_off() {
    // 옵션 기본값
    assert!(!UsageOptions::default().cross_volumes);

    // 경계 판정 단위 테스트
    let dir = |dev: u64| Entry {
        name: "d".into(),
        path: VfsPath::new("/x/d"),
        kind: EntryKind::Dir,
        size: 0,
        modified: None,
        created: None,
        mode: None,
        hidden: false,
        file_id: Some(FileId {
            dev,
            ino: 1,
            nlink: 2,
        }),
    };
    let off = UsageOptions::default();
    let on = UsageOptions {
        cross_volumes: true,
        ..UsageOptions::default()
    };
    assert!(!crosses_volume(Some(1), &dir(1), &off)); // 같은 장치
    assert!(crosses_volume(Some(1), &dir(2), &off)); // 다른 장치, 기본은 넘지 않는다
    assert!(!crosses_volume(Some(1), &dir(2), &on)); // 옵션이 켜지면 넘는다
    assert!(!crosses_volume(None, &dir(2), &off)); // 장치를 모르면(아카이브 등) 막지 않는다

    // 실제 순회: 특정 폴더가 다른 장치처럼 보이게 한 Vfs
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    write(&root.join("here/a.bin"), 10);
    write(&root.join("mount/deep/b.bin"), 1000);
    write(&root.join("top.bin"), 1);
    let vfs = Wrap {
        other_device: Some(root.join("mount")),
        ..Wrap::new()
    };
    // 최상위 항목 `mount`는 대상 폴더의 직속 하위이므로 자체 경계 검사 없이 세고, 그 안의 하위 폴더 `deep`부터 경계를 본다
    let (items, report) = usage(&vfs, root, &off);
    let get = |items: &[UsageItem], n: &str| items.iter().find(|i| i.name == n).unwrap().bytes;
    assert_eq!(get(&items, "here"), 10);
    assert_eq!(
        get(&items, "mount"),
        0,
        "다른 볼륨의 하위 폴더 deep은 세지 않는다"
    );
    assert_eq!(report.volume_skipped, 1);
    let (items, report) = usage(&vfs, root, &on);
    assert_eq!(get(&items, "mount"), 1000);
    assert_eq!(report.volume_skipped, 0);
}
