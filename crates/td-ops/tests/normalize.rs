mod common;

use std::fs;

use common::*;
use td_vfs::VfsPath;
use unicode_normalization::UnicodeNormalization;

/// 폴더가 돌려주는 이름 그대로(바이트 수준)의 목록. APFS는 만든 형태를 그대로 저장한다.
fn names(dir: &VfsPath) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(dir.as_path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

fn nfd(s: &str) -> String {
    s.nfd().collect()
}

fn nfc(s: &str) -> String {
    s.nfc().collect()
}

#[test]
fn normalize_names_turns_nfd_into_nfc_on_disk() {
    let f = fixture();
    let name = nfd("한글 문서.txt");
    assert_ne!(name, nfc(&name), "시험 이름이 분해형이어야 한다");
    fs::write(f.a.join(&name).as_path(), "내용").unwrap();
    let report = f.ops.normalize_names(&[f.a.join(&name)]);
    assert_eq!(report.renamed.len(), 1, "{report:?}");
    assert!(
        report.conflicts.is_empty() && report.failed.is_empty(),
        "{report:?}"
    );
    assert_eq!(names(&f.a), vec![nfc("한글 문서.txt")]);
    assert_eq!(
        fs::read_to_string(f.a.join(&nfc("한글 문서.txt")).as_path()).unwrap(),
        "내용"
    );
}

#[test]
fn normalize_names_leaves_nfc_and_ascii_names_alone() {
    let f = fixture();
    let ok = nfc("이미조합형.txt");
    fs::write(f.a.join(&ok).as_path(), "a").unwrap();
    fs::write(f.a.join("plain.txt").as_path(), "b").unwrap();
    let report = f
        .ops
        .normalize_names(&[f.a.join(&ok), f.a.join("plain.txt")]);
    assert!(report.renamed.is_empty() && report.conflicts.is_empty() && report.failed.is_empty());
    let mut want = vec![ok, "plain.txt".to_string()];
    want.sort();
    assert_eq!(names(&f.a), want);
}

#[test]
fn normalize_names_never_overwrites_a_different_file_with_the_same_nfc_name() {
    let f = fixture();
    // 분해형 파일과 조합형 파일이 따로 있을 수 있는(분해형을 그대로 저장하는) 파일 시스템에서만 의미가 있다.
    let nfd_name = nfd("겹침.txt");
    let nfc_name = nfc("겹침.txt");
    fs::write(f.a.join(&nfd_name).as_path(), "분해").unwrap();
    fs::write(f.a.join(&nfc_name).as_path(), "조합").unwrap();
    if names(&f.a).len() < 2 {
        return; // APFS 같은 곳은 두 이름이 한 파일이다(둘째 쓰기가 첫째를 덮었다). 충돌이 생길 수 없다.
    }
    let report = f.ops.normalize_names(&[f.a.join(&nfd_name)]);
    assert_eq!(report.conflicts.len(), 1, "{report:?}");
    assert!(report.renamed.is_empty());
    assert_eq!(
        fs::read_to_string(f.a.join(&nfc_name).as_path()).unwrap(),
        "조합"
    );
    assert_eq!(
        fs::read_to_string(f.a.join(&nfd_name).as_path()).unwrap(),
        "분해"
    );
}

#[test]
fn normalize_dir_fixes_direct_children_only() {
    let f = fixture();
    let dir_nfd = nfd("폴더");
    let inner_nfd = nfd("안쪽 파일.txt");
    let top_nfd = nfd("바깥 파일.txt");
    fs::create_dir(f.a.join(&dir_nfd).as_path()).unwrap();
    fs::write(f.a.join(&dir_nfd).join(&inner_nfd).as_path(), "x").unwrap();
    fs::write(f.a.join(&top_nfd).as_path(), "y").unwrap();
    let report = f.ops.normalize_dir(&f.a).unwrap();
    assert_eq!(report.renamed.len(), 2, "폴더와 바깥 파일: {report:?}");
    let mut want = vec![nfc("폴더"), nfc("바깥 파일.txt")];
    want.sort();
    assert_eq!(names(&f.a), want);
    // 하위 폴더 안의 이름은 그대로다.
    assert_eq!(names(&f.a.join(&nfc("폴더"))), vec![inner_nfd]);
}
