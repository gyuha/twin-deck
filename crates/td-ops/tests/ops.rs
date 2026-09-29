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
