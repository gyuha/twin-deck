mod common;

use std::fs;

use common::*;
use td_ops::{ConflictPolicy, Control, NoControl, OpsError, Outcome};
use td_vfs::VfsPath;

struct StopAfter(std::cell::Cell<usize>, usize);
impl Control for StopAfter {
    fn on_item(&self, _path: &VfsPath) {
        self.0.set(self.0.get() + 1);
    }
    fn should_stop(&self) -> bool {
        self.0.get() >= self.1
    }
}

fn names(dir: &VfsPath) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir.as_path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

#[test]
fn compress_names_conflicts_and_keeps_originals() {
    let f = fixture();
    write(&f.a.join("report.txt"), "r");
    f.ops.mkdir(&f.a.join("docs/sub")).unwrap();
    write(&f.a.join("docs/sub/x.txt"), "x");
    let go = |src: &[VfsPath], policy| {
        f.ops
            .compress_with(src, &f.a, None, policy, &NoControl)
            .unwrap()
    };

    // 파일 하나: 확장자를 뺀 이름, 폴더 하나: 폴더 이름, 여러 개: 압축 위치의 폴더 이름
    assert_eq!(
        go(&[f.a.join("report.txt")], ConflictPolicy::Rename),
        Outcome::Done(f.a.join("report.zip"))
    );
    assert_eq!(
        go(&[f.a.join("docs")], ConflictPolicy::Rename),
        Outcome::Done(f.a.join("docs.zip"))
    );
    assert_eq!(
        go(
            &[f.a.join("report.txt"), f.a.join("docs")],
            ConflictPolicy::Rename
        ),
        Outcome::Done(f.a.join("a.zip"))
    );
    // 이름이 겹치면 번호, 건너뛰기, 덮어쓰기
    assert_eq!(
        go(&[f.a.join("report.txt")], ConflictPolicy::Rename),
        Outcome::Done(f.a.join("report (1).zip"))
    );
    assert_eq!(
        go(&[f.a.join("report.txt")], ConflictPolicy::Skip),
        Outcome::Skipped
    );
    let before = fs::metadata(f.a.join("report.zip").as_path())
        .unwrap()
        .len();
    fs::write(f.a.join("report.zip").as_path(), "junk").unwrap();
    assert_eq!(
        go(&[f.a.join("report.txt")], ConflictPolicy::Overwrite),
        Outcome::Done(f.a.join("report.zip"))
    );
    assert_eq!(
        fs::metadata(f.a.join("report.zip").as_path())
            .unwrap()
            .len(),
        before
    );
    // 이름을 직접 지정
    assert_eq!(
        f.ops
            .compress_with(
                &[f.a.join("docs")],
                &f.b,
                Some("my.zip"),
                ConflictPolicy::Rename,
                &NoControl
            )
            .unwrap(),
        Outcome::Done(f.b.join("my.zip"))
    );
    assert!(f
        .ops
        .compress_with(
            &[f.a.join("docs")],
            &f.b,
            Some("a/b.zip"),
            ConflictPolicy::Rename,
            &NoControl
        )
        .is_err());
    // 원본은 그대로
    assert_eq!(read(&f.a.join("report.txt")), "r");
    assert_eq!(read(&f.a.join("docs/sub/x.txt")), "x");
    // 없는 원본과 빈 목록
    assert!(f
        .ops
        .compress_with(
            &[f.a.join("nope")],
            &f.a,
            None,
            ConflictPolicy::Rename,
            &NoControl
        )
        .is_err());
    assert!(f
        .ops
        .compress_with(&[], &f.a, None, ConflictPolicy::Rename, &NoControl)
        .is_err());
}

#[test]
fn compress_abort_leaves_nothing() {
    let f = fixture();
    for i in 0..10 {
        write(&f.a.join(&format!("f{i}.txt")), "x");
    }
    let srcs: Vec<VfsPath> = (0..10).map(|i| f.a.join(&format!("f{i}.txt"))).collect();
    let err = f
        .ops
        .compress_with(
            &srcs,
            &f.b,
            Some("out.zip"),
            ConflictPolicy::Rename,
            &StopAfter(Default::default(), 3),
        )
        .unwrap_err();
    assert!(matches!(err, OpsError::Aborted), "{err}");
    assert!(names(&f.b).is_empty(), "남은 파일: {:?}", names(&f.b));
}

#[test]
fn extract_names_conflicts_and_keeps_archive() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("proj/sub")).unwrap();
    write(&f.a.join("proj/sub/x.txt"), "x");
    write(&f.a.join("proj/top.txt"), "t");
    f.ops
        .compress_with(
            &[f.a.join("proj")],
            &f.a,
            Some("pack.zip"),
            ConflictPolicy::Rename,
            &NoControl,
        )
        .unwrap();

    let go = |policy| {
        f.ops
            .extract_with(&f.a.join("pack.zip"), &f.b, None, policy, &NoControl)
            .unwrap()
    };
    assert_eq!(go(ConflictPolicy::Rename), Outcome::Done(f.b.join("pack")));
    assert_eq!(read(&f.b.join("pack/proj/sub/x.txt")), "x");
    assert_eq!(read(&f.b.join("pack/proj/top.txt")), "t");
    assert_eq!(
        go(ConflictPolicy::Rename),
        Outcome::Done(f.b.join("pack (1)"))
    );
    assert_eq!(go(ConflictPolicy::Skip), Outcome::Skipped);
    assert_eq!(
        go(ConflictPolicy::Overwrite),
        Outcome::Done(f.b.join("pack"))
    );
    assert_eq!(
        f.ops
            .extract_with(
                &f.a.join("pack.zip"),
                &f.b,
                Some("named"),
                ConflictPolicy::Rename,
                &NoControl
            )
            .unwrap(),
        Outcome::Done(f.b.join("named"))
    );
    assert!(
        f.a.join("pack.zip").as_path().exists(),
        "원본 아카이브는 지우지 않는다"
    );
    // 아카이브가 아닌 파일은 거부, 폴더 이름 규칙은 tar.gz도 확장자를 모두 뗀다
    write(&f.a.join("plain.txt"), "p");
    assert!(f
        .ops
        .extract_with(
            &f.a.join("plain.txt"),
            &f.b,
            None,
            ConflictPolicy::Rename,
            &NoControl
        )
        .is_err());
    assert!(!f.b.join("plain").as_path().exists());
}

#[test]
fn extract_rejects_zip_slip_without_writing_anything() {
    let f = fixture();
    // "../evil.txt" 항목이 든 tar를 손으로 만든다(표준 도구는 이런 이름을 만들지 않는다).
    let mut header = [0u8; 512];
    let name = b"../evil.txt";
    header[..name.len()].copy_from_slice(name);
    header[100..108].copy_from_slice(b"0000644\0");
    header[124..136].copy_from_slice(b"00000000005\0");
    header[136..148].copy_from_slice(b"00000000000\0");
    header[156] = b'0';
    header[257..263].copy_from_slice(b"ustar\0");
    header[148..156].copy_from_slice(b"        ");
    let sum: u32 = header.iter().map(|&b| b as u32).sum();
    header[148..156].copy_from_slice(format!("{sum:06o}\0 ").as_bytes());
    let mut tar = header.to_vec();
    tar.extend_from_slice(b"evil\n");
    tar.resize(tar.len() + (512 - 5), 0); // 내용(5바이트)을 512바이트 블록으로 채운다
    tar.extend_from_slice(&[0u8; 1024]);
    fs::write(f.a.join("evil.tar").as_path(), tar).unwrap();

    let err = f
        .ops
        .extract_with(
            &f.a.join("evil.tar"),
            &f.b,
            None,
            ConflictPolicy::Rename,
            &NoControl,
        )
        .unwrap_err();
    assert!(err.to_string().contains("안전하지 않은"), "{err}");
    assert!(
        names(&f.b).is_empty(),
        "추출 폴더가 남았다: {:?}",
        names(&f.b)
    );
    assert!(
        !f.b.as_path().parent().unwrap().join("evil.txt").exists(),
        "경로를 탈출해 썼다"
    );
}

#[test]
fn extract_abort_removes_partial_folder() {
    let f = fixture();
    for i in 0..8 {
        write(&f.a.join(&format!("f{i}.txt")), "x");
    }
    let srcs: Vec<VfsPath> = (0..8).map(|i| f.a.join(&format!("f{i}.txt"))).collect();
    f.ops
        .compress_with(
            &srcs,
            &f.a,
            Some("many.zip"),
            ConflictPolicy::Rename,
            &NoControl,
        )
        .unwrap();
    let err = f
        .ops
        .extract_with(
            &f.a.join("many.zip"),
            &f.b,
            None,
            ConflictPolicy::Rename,
            &StopAfter(Default::default(), 3),
        )
        .unwrap_err();
    assert!(matches!(err, OpsError::Aborted), "{err}");
    assert!(
        names(&f.b).is_empty(),
        "만들다 만 폴더가 남았다: {:?}",
        names(&f.b)
    );
}

#[cfg(unix)]
#[test]
fn symlink_create() {
    let f = fixture();
    write(&f.a.join("target.txt"), "t");
    f.ops.mkdir(&f.a.join("dir")).unwrap();

    // 파일 링크: 이름은 원본 이름, 대상은 원본 경로
    let out = f
        .ops
        .symlink(&f.a.join("target.txt"), &f.b, ConflictPolicy::Rename)
        .unwrap();
    assert_eq!(out, Outcome::Done(f.b.join("target.txt")));
    let link = f.b.join("target.txt");
    assert!(fs::symlink_metadata(link.as_path())
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(
        fs::read_link(link.as_path()).unwrap(),
        f.a.join("target.txt").as_path()
    );
    assert_eq!(read(&link), "t"); // 링크를 통해 읽힌다
                                  // 폴더 링크
    f.ops
        .symlink(&f.a.join("dir"), &f.b, ConflictPolicy::Rename)
        .unwrap();
    assert!(f.b.join("dir").as_path().is_dir());
    assert!(fs::symlink_metadata(f.b.join("dir").as_path())
        .unwrap()
        .file_type()
        .is_symlink());
    // 충돌: 번호 / 건너뛰기 / 덮어쓰기
    assert_eq!(
        f.ops
            .symlink(&f.a.join("target.txt"), &f.b, ConflictPolicy::Rename)
            .unwrap(),
        Outcome::Done(f.b.join("target (1).txt"))
    );
    assert_eq!(
        f.ops
            .symlink(&f.a.join("target.txt"), &f.b, ConflictPolicy::Skip)
            .unwrap(),
        Outcome::Skipped
    );
    write(&f.b.join("plain.txt"), "old");
    write(&f.a.join("plain.txt"), "new");
    f.ops
        .symlink(&f.a.join("plain.txt"), &f.b, ConflictPolicy::Overwrite)
        .unwrap();
    assert!(fs::symlink_metadata(f.b.join("plain.txt").as_path())
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(read(&f.b.join("plain.txt")), "new");
    // 없는 원본
    assert!(f
        .ops
        .symlink(&f.a.join("missing"), &f.b, ConflictPolicy::Rename)
        .is_err());
    // 원본은 그대로
    assert_eq!(read(&f.a.join("target.txt")), "t");
}
