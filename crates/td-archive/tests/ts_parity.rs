//! UI(TypeScript)가 Enter로 아카이브를 열지 판단하는 목록이 Rust의 `kind_for_name`과 어긋나지 않는지 확인한다.

use std::fs;
use std::path::Path;

use td_archive::{kind_for_name, Kind, ZIP_EXTS};

fn quoted_list(src: &str, name: &str) -> Vec<String> {
    let line = src
        .lines()
        .find(|l| l.contains(&format!("const {name}")))
        .unwrap_or_else(|| panic!("{name} 정의를 찾을 수 없다"));
    // 따옴표로 나눈 조각 중 홀수 번째(따옴표 안)만 값이다.
    line.split('"')
        .enumerate()
        .filter(|(i, _)| i % 2 == 1)
        .map(|(_, s)| s.to_string())
        .collect()
}

#[test]
fn ts_archive_lists_match_rust() {
    let ts = fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/ts-client/src/archive.ts"),
    )
    .unwrap();

    let mut ts_zip = quoted_list(&ts, "ZIP_EXTS");
    let mut rust_zip: Vec<String> = ZIP_EXTS.iter().map(|s| s.to_string()).collect();
    ts_zip.sort();
    rust_zip.sort();
    assert_eq!(ts_zip, rust_zip, "ZIP 확장자 목록이 TS와 Rust에서 다르다");

    let tar = quoted_list(&ts, "TAR_SUFFIXES");
    assert!(!tar.is_empty());
    for suffix in &tar {
        assert!(
            matches!(
                kind_for_name(&format!("a{suffix}"), &[]),
                Some(Kind::Tar | Kind::TarGz | Kind::TarBz2)
            ),
            "TS의 tar 접미사 {suffix}를 Rust가 아카이브로 보지 않는다"
        );
    }
    // 반대 방향: Rust가 tar로 보는 접미사가 TS 목록에 있어야 한다.
    for suffix in [".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tbz", ".tar"] {
        assert!(tar.iter().any(|t| t == suffix), "TS 목록에 {suffix}가 없다");
    }
}
