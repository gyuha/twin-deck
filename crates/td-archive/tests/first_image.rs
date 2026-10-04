use std::fs;
use std::path::Path;
use std::process::Command;

use td_archive::{Archive, Kind};

/// `files`를 이 순서로 담은 ZIP을 만든다. 이름이 `/`로 끝나면 폴더다. 도구가 없으면 테스트가 실패한다.
fn make_zip(dir: &Path, name: &str, files: &[&str]) -> std::path::PathBuf {
    let src = dir.join("src");
    fs::create_dir_all(&src).unwrap();
    for f in files {
        if let Some(d) = f.strip_suffix('/') {
            fs::create_dir_all(src.join(d)).unwrap();
        } else {
            fs::create_dir_all(src.join(f).parent().unwrap()).unwrap();
            fs::write(src.join(f), f).unwrap();
        }
    }
    let out = dir.join(name);
    let status = Command::new("zip")
        .args(["-q", "-r", out.to_str().unwrap(), "."])
        .current_dir(&src)
        .env("COPYFILE_DISABLE", "1")
        .status()
        .expect("zip 실행 불가");
    assert!(status.success());
    fs::remove_dir_all(&src).unwrap();
    out
}

fn first(dir: &Path, files: &[&str]) -> Option<String> {
    let zip = make_zip(dir, "t.cbz", files);
    let a = Archive::open_as(&zip, Kind::Zip).unwrap();
    a.first_image().map(|e| e.name.clone())
}

#[test]
fn first_image_uses_natural_order() {
    let t = tempfile::tempdir().unwrap();
    // 사전순이면 10이 2보다 앞서지만 자연 정렬로는 2가 먼저다.
    assert_eq!(
        first(t.path(), &["10.jpg", "2.jpg", "100.png", "03.jpg"]).as_deref(),
        Some("2.jpg")
    );
    let t = tempfile::tempdir().unwrap();
    assert_eq!(
        first(t.path(), &["p10.jpg", "P2.JPG", "p100.jpg"]).as_deref(),
        Some("P2.JPG"),
        "대소문자 무시, 숫자는 크기로"
    );
}

#[test]
fn first_image_skips_non_images_dirs_and_hidden() {
    let t = tempfile::tempdir().unwrap();
    assert_eq!(
        first(
            t.path(),
            &[
                "0-cover.txt",
                "001.xml",
                ".DS_Store",
                "__MACOSX/._001.jpg",
                "__MACOSX/001.jpg",
                "sub/",
                ".hidden/001.jpg",
                "ch1/010.webp",
                "ch1/002.png",
                "ch2/001.jpg",
            ]
        )
        .as_deref(),
        // 경로 전체를 자연 정렬하므로 ch1/ 안이 ch2/보다 앞서고, 그 안에서는 002가 010보다 앞선다.
        Some("ch1/002.png")
    );
}

#[test]
fn first_image_none_when_no_images() {
    let t = tempfile::tempdir().unwrap();
    assert_eq!(first(t.path(), &["a.txt", "b/c.md", "d/"]), None);
    let t = tempfile::tempdir().unwrap();
    assert_eq!(first(t.path(), &[".1.jpg", "__MACOSX/1.jpg"]), None);
}
