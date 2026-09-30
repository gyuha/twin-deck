use std::fs;
use std::path::Path;
use std::process::Command;

use td_archive::{CompositeFs, Source, ZipEdit};
use td_ops::{ConflictPolicy, Ops, OpsError, Outcome, Trasher};
use td_vfs::{EntryKind, ListOptions, Vfs, VfsPath};
use unicode_normalization::UnicodeNormalization;

struct NoTrash;
impl Trasher for NoTrash {
    fn trash(&self, _path: &Path) -> td_ops::Result<()> {
        panic!("아카이브 경로는 휴지통에 닿으면 안 된다");
    }
}

fn ops() -> Ops<CompositeFs, NoTrash> {
    Ops::new(CompositeFs::default(), NoTrash)
}

fn vp(p: &Path) -> VfsPath {
    VfsPath::new(p)
}

/// `zip!/inner` 표기의 경로.
fn inside(zip: &Path, inner: &str) -> VfsPath {
    VfsPath::new(format!("{}!/{inner}", zip.display()))
}

fn root_of(zip: &Path) -> VfsPath {
    VfsPath::new(format!("{}!", zip.display()))
}

fn sh(dir: &Path, program: &str, args: &[&str]) -> Vec<u8> {
    let out = Command::new(program)
        .args(args)
        .current_dir(dir)
        .env("COPYFILE_DISABLE", "1")
        .output()
        .unwrap_or_else(|e| panic!("{program} 실행 불가: {e}"));
    assert!(
        out.status.success(),
        "{program} {args:?}: {}{}",
        String::from_utf8_lossy(&out.stderr),
        String::from_utf8_lossy(&out.stdout)
    );
    out.stdout
}

/// 시스템 `unzip -t` 통과 여부 + bsdtar가 본 항목 이름(NFC, 정렬).
fn external_names(zip: &Path) -> Vec<String> {
    let dir = zip.parent().unwrap();
    let name = zip.file_name().unwrap().to_str().unwrap();
    sh(dir, "unzip", &["-tq", name]);
    let out = sh(dir, "tar", &["-tf", name]);
    let mut v: Vec<String> = String::from_utf8_lossy(&out)
        .lines()
        .map(|l| l.nfc().collect())
        .collect();
    v.sort();
    v
}

fn new_zip(path: &Path) {
    let mut z = ZipEdit::create(path).unwrap();
    z.add_file("seed.txt", Source::Bytes(b"seed".to_vec()));
    z.commit().unwrap();
}

fn names(fs: &CompositeFs, dir: &VfsPath) -> Vec<String> {
    let mut v: Vec<String> = fs
        .list(dir, &ListOptions { show_hidden: true })
        .unwrap()
        .into_iter()
        .map(|e| e.name)
        .collect();
    v.sort();
    v
}

/// 로컬 폴더 `tree/`: 한글 이름, 중첩 폴더, 실행 권한 파일.
fn make_tree(root: &Path) -> std::path::PathBuf {
    let tree = root.join("tree");
    fs::create_dir_all(tree.join("sub/deep")).unwrap();
    fs::write(tree.join("a.txt"), "alpha").unwrap();
    fs::write(tree.join("한글.txt"), "가나다").unwrap();
    fs::write(tree.join("sub/deep/run.sh"), "#!/bin/sh\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            tree.join("sub/deep/run.sh"),
            fs::Permissions::from_mode(0o755),
        )
        .unwrap();
    }
    tree
}

#[test]
fn composite_copy_between_local_and_archive() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let tree = make_tree(root);
    let zip = root.join("dest.zip");
    new_zip(&zip);
    let ops = ops();
    let cfs = CompositeFs::default();

    // 로컬 폴더 → zip 안 (재귀)
    let out = ops
        .copy(&vp(&tree), &root_of(&zip), ConflictPolicy::Skip)
        .unwrap();
    assert_eq!(out, Outcome::Done(inside(&zip, "tree")));
    assert_eq!(
        external_names(&zip),
        [
            "seed.txt",
            "tree/",
            "tree/a.txt",
            "tree/sub/",
            "tree/sub/deep/",
            "tree/sub/deep/run.sh",
            "tree/한글.txt",
        ]
    );
    assert_eq!(
        names(&cfs, &inside(&zip, "tree")),
        ["a.txt", "sub", "한글.txt"]
    );

    // 충돌 3종: 건너뛰기 / 덮어쓰기 / 이름 바꿈
    fs::write(tree.join("a.txt"), "ALPHA2").unwrap();
    assert_eq!(
        ops.detect_conflict(&vp(&tree.join("a.txt")), &inside(&zip, "tree")),
        Some(inside(&zip, "tree/a.txt"))
    );
    let a = vp(&tree.join("a.txt"));
    let dir = inside(&zip, "tree");
    assert_eq!(
        ops.copy(&a, &dir, ConflictPolicy::Skip).unwrap(),
        Outcome::Skipped
    );
    assert_eq!(
        cfs.stat(&inside(&zip, "tree/a.txt")).unwrap().size,
        5,
        "건너뛰면 원래 내용이 그대로여야 한다"
    );
    ops.copy(&a, &dir, ConflictPolicy::Overwrite).unwrap();
    assert_eq!(cfs.stat(&inside(&zip, "tree/a.txt")).unwrap().size, 6);
    let renamed = ops.copy(&a, &dir, ConflictPolicy::Rename).unwrap();
    assert_eq!(renamed, Outcome::Done(inside(&zip, "tree/a (1).txt")));
    external_names(&zip);

    // zip 안 폴더 → 로컬 (재귀), 내용과 실행 권한 보존
    let out_dir = root.join("out");
    fs::create_dir(&out_dir).unwrap();
    ops.copy(&inside(&zip, "tree"), &vp(&out_dir), ConflictPolicy::Skip)
        .unwrap();
    assert_eq!(
        fs::read_to_string(out_dir.join("tree/a.txt")).unwrap(),
        "ALPHA2"
    );
    assert_eq!(
        fs::read_to_string(out_dir.join("tree/한글.txt")).unwrap(),
        "가나다"
    );
    assert_eq!(
        fs::read_to_string(out_dir.join("tree/sub/deep/run.sh")).unwrap(),
        "#!/bin/sh\n"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(out_dir.join("tree/sub/deep/run.sh"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755);
    }

    // 아카이브 안에서 만들기 / 이름 바꾸기 / 삭제
    ops.mkdir(&inside(&zip, "made/new")).unwrap();
    assert!(ops.mkdir(&inside(&zip, "made/new")).is_err());
    ops.touch(&inside(&zip, "made/empty.txt")).unwrap();
    assert!(ops.touch(&inside(&zip, "made/empty.txt")).is_err());
    let moved = ops
        .rename(&inside(&zip, "made/empty.txt"), "이름.txt")
        .unwrap();
    assert_eq!(moved, inside(&zip, "made/이름.txt"));
    ops.delete(&inside(&zip, "tree/sub")).unwrap();
    ops.delete(&inside(&zip, "tree/a (1).txt")).unwrap();
    assert!(cfs.stat(&inside(&zip, "tree/sub")).is_err());
    // "made/"는 항목 없이 하위 경로로만 존재한다(유효한 zip, unzip -t 통과).
    assert_eq!(
        external_names(&zip),
        [
            "made/new/",
            "made/이름.txt",
            "seed.txt",
            "tree/",
            "tree/a.txt",
            "tree/한글.txt",
        ]
    );
}

#[test]
fn composite_move_and_archive_to_archive() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let zip = root.join("a.zip");
    let other = root.join("b.zip");
    new_zip(&zip);
    new_zip(&other);
    let ops = ops();
    let cfs = CompositeFs::default();

    // 로컬 → zip 이동: 원본은 사라진다
    let f = root.join("move-me.txt");
    fs::write(&f, "m").unwrap();
    ops.move_to(&vp(&f), &root_of(&zip), ConflictPolicy::Skip)
        .unwrap();
    assert!(!f.exists());
    assert!(cfs.stat(&inside(&zip, "move-me.txt")).is_ok());

    // zip 안 같은 아카이브 이동(rename 경로)
    ops.mkdir(&inside(&zip, "d")).unwrap();
    ops.move_to(
        &inside(&zip, "move-me.txt"),
        &inside(&zip, "d"),
        ConflictPolicy::Skip,
    )
    .unwrap();
    assert!(cfs.stat(&inside(&zip, "move-me.txt")).is_err());
    assert!(cfs.stat(&inside(&zip, "d/move-me.txt")).is_ok());

    // 다른 zip으로 이동
    ops.move_to(&inside(&zip, "d"), &root_of(&other), ConflictPolicy::Skip)
        .unwrap();
    assert!(cfs.stat(&inside(&zip, "d")).is_err());
    assert_eq!(names(&cfs, &inside(&other, "d")), ["move-me.txt"]);

    // zip → 로컬 이동
    let out = root.join("out");
    fs::create_dir(&out).unwrap();
    ops.move_to(&inside(&other, "d"), &vp(&out), ConflictPolicy::Skip)
        .unwrap();
    assert_eq!(fs::read_to_string(out.join("d/move-me.txt")).unwrap(), "m");
    assert!(cfs.stat(&inside(&other, "d")).is_err());

    external_names(&zip);
    external_names(&other);
}

#[test]
fn composite_nested_and_readonly_and_trash() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let inner = root.join("inner.zip");
    new_zip(&inner);
    let outer = root.join("outer.zip");
    let mut z = ZipEdit::create(&outer).unwrap();
    z.add_file("inner.zip", Source::Path(inner.clone()));
    z.commit().unwrap();
    fs::remove_file(&inner).unwrap();
    let ops = ops();
    let cfs = CompositeFs::default();

    // 중첩 zip 안으로 복사하면 바깥 zip에 되써진다
    let f = root.join("n.txt");
    fs::write(&f, "nested").unwrap();
    let nested_root = VfsPath::new(format!("{}!/inner.zip!", outer.display()));
    ops.copy(&vp(&f), &nested_root, ConflictPolicy::Skip)
        .unwrap();
    assert_eq!(names(&cfs, &nested_root), ["n.txt", "seed.txt"]);
    external_names(&outer);

    // 휴지통은 아카이브 안에서 거부(휴지통에 닿지 않는다)
    let err = ops.trash(&inside(&outer, "inner.zip")).unwrap_err();
    assert!(matches!(err, OpsError::Trash(_)), "{err}");

    // tar.gz는 읽기 전용: 목록/추출은 되고 쓰기는 오류
    let src = root.join("t");
    fs::create_dir(&src).unwrap();
    fs::write(src.join("x.txt"), "x").unwrap();
    sh(root, "tar", &["-czf", "pack.tar.gz", "-C", "t", "x.txt"]);
    let tgz = root.join("pack.tar.gz");
    assert_eq!(names(&cfs, &root_of(&tgz)), ["x.txt"]);
    assert!(ops.touch(&inside(&tgz, "y.txt")).is_err());
    assert!(ops.delete(&inside(&tgz, "x.txt")).is_err());
    let dest = root.join("dest");
    fs::create_dir(&dest).unwrap();
    ops.copy(&inside(&tgz, "x.txt"), &vp(&dest), ConflictPolicy::Skip)
        .unwrap();
    assert_eq!(fs::read_to_string(dest.join("x.txt")).unwrap(), "x");

    // 존재하지 않는 항목, 파일에 list
    assert!(cfs.stat(&inside(&outer, "nope")).is_err());
    assert!(cfs
        .list(&inside(&outer, "inner.zip"), &ListOptions::default())
        .is_err());
    let info = cfs.info(&inside(&outer, "inner.zip")).unwrap();
    assert_eq!(info.entry.kind, EntryKind::File);
}
