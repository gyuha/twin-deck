use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::process::Command;

use td_archive::{compress, Archive, ArchiveError};
use unicode_normalization::UnicodeNormalization;

fn sh(dir: &Path, program: &str, args: &[&str]) -> String {
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
    String::from_utf8_lossy(&out.stdout).into_owned()
}

/// 트리의 (NFC 상대 경로 → 내용, 폴더는 None). macOS/Linux의 이름 정규화 차이를 없앤다.
fn tree(root: &Path) -> BTreeMap<String, Option<Vec<u8>>> {
    fn walk(base: &Path, dir: &Path, out: &mut BTreeMap<String, Option<Vec<u8>>>) {
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            let rel: String = p
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .nfc()
                .collect();
            if p.is_dir() {
                out.insert(rel, None);
                walk(base, &p, out);
            } else {
                out.insert(rel, Some(fs::read(&p).unwrap()));
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

/// 한글 이름, 빈 폴더, 깊은 중첩, 실행 파일, 큰 파일이 든 트리 `proj/`.
fn build_project(root: &Path) -> std::path::PathBuf {
    let p = root.join("proj");
    fs::create_dir_all(p.join("한글 폴더/깊은/곳")).unwrap();
    fs::create_dir_all(p.join("empty")).unwrap();
    fs::create_dir_all(p.join("bin")).unwrap();
    fs::write(p.join("a.txt"), "alpha\n").unwrap();
    fs::write(p.join("한글 폴더/파일.txt"), "가나다라\n").unwrap();
    fs::write(p.join("한글 폴더/깊은/곳/leaf.dat"), [0u8, 1, 2, 255, 254]).unwrap();
    fs::write(p.join("bin/run.sh"), "#!/bin/sh\necho ok\n").unwrap();
    let big: Vec<u8> = (0..300_000u32)
        .map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8)
        .collect();
    fs::write(p.join("big.bin"), big).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(p.join("bin/run.sh"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    p
}

#[test]
fn compress_extract_roundtrip_external() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let proj = build_project(root);
    let original = tree(root); // proj/ 포함

    // 1) 우리가 압축한 zip을 시스템 도구가 푼다: 무결성(unzip -t), 목록, 내용
    let ours = root.join("ours.zip");
    let report = compress(&[proj.clone()], &ours, &mut |_| true).unwrap();
    assert_eq!((report.files, report.skipped_links), (5, 0));
    assert_eq!(report.dirs, 6); // proj, 한글 폴더, 깊은, 곳, empty, bin
    sh(root, "unzip", &["-tq", "ours.zip"]);
    // 이름 검증과 추출은 독립 구현인 bsdtar로 (구형 unzip은 비ASCII 이름을 깨뜨려 출력한다)
    let out_tar = root.join("out_tar");
    fs::create_dir(&out_tar).unwrap();
    sh(root, "tar", &["-xf", "ours.zip", "-C", "out_tar"]);
    assert_eq!(tree(&out_tar), original, "bsdtar로 푼 결과가 원본과 다르다");
    // 시스템 unzip으로도 ASCII 이름의 파일은 바이트가 같다
    let out_unzip = root.join("out_unzip");
    sh(root, "unzip", &["-q", "ours.zip", "-d", "out_unzip"]);
    assert_eq!(
        fs::read(out_unzip.join("proj/big.bin")).unwrap(),
        fs::read(proj.join("big.bin")).unwrap()
    );
    assert_eq!(
        fs::read_to_string(out_unzip.join("proj/a.txt")).unwrap(),
        "alpha\n"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(out_unzip.join("proj/bin/run.sh"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755, "실행 권한이 보존돼야 한다");
    }

    // 2) 시스템 zip이 만든 zip을 우리 추출이 푼다
    let sys = root.join("sys.zip");
    sh(root, "zip", &["-qr", "-X", "sys.zip", "proj"]);
    assert!(sys.exists());
    let out_ours = root.join("out_ours");
    let extracted = Archive::open(&sys, &[])
        .unwrap()
        .extract_all(&out_ours)
        .unwrap();
    assert_eq!(extracted.files, 5);
    assert_eq!(tree(&out_ours), original, "우리 추출 결과가 원본과 다르다");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = fs::metadata(out_ours.join("proj/bin/run.sh"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755);
    }

    // 3) 우리 압축 → 우리 추출도 왕복한다
    let out_self = root.join("out_self");
    Archive::open(&ours, &[])
        .unwrap()
        .extract_all(&out_self)
        .unwrap();
    assert_eq!(tree(&out_self), original);
}

#[test]
fn compress_edge_cases() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    let proj = build_project(root);

    // 이미 있는 대상은 덮어쓰지 않는다
    let dest = root.join("exists.zip");
    fs::write(&dest, "keep").unwrap();
    assert!(matches!(
        compress(&[proj.clone()], &dest, &mut |_| true),
        Err(ArchiveError::Exists(_))
    ));
    assert_eq!(fs::read_to_string(&dest).unwrap(), "keep");

    // 같은 이름의 최상위 항목이 둘이면 오류
    fs::create_dir(root.join("other")).unwrap();
    fs::write(root.join("other/a.txt"), "x").unwrap();
    let err = compress(
        &[proj.join("a.txt"), root.join("other/a.txt")],
        &root.join("dup.zip"),
        &mut |_| true,
    )
    .unwrap_err();
    assert!(err.to_string().contains("같은 이름"), "{err}");
    assert!(!root.join("dup.zip").exists());

    // 중단하면 zip도 임시 파일도 남지 않는다
    let mut seen = 0;
    let aborted = root.join("aborted.zip");
    let err = compress(&[proj.clone()], &aborted, &mut |_| {
        seen += 1;
        seen < 4
    })
    .unwrap_err();
    assert!(matches!(err, ArchiveError::Aborted), "{err}");
    assert!(!aborted.exists());
    let leftovers: Vec<_> = fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.starts_with(".td-archive-"))
        .collect();
    assert!(leftovers.is_empty(), "임시 파일이 남았다: {leftovers:?}");

    // 압축 파일 자신은 넣지 않는다(대상이 원본 폴더 안에 있어도)
    let inside = proj.join("self.zip");
    compress(&[proj.clone()], &inside, &mut |_| true).unwrap();
    let names: Vec<String> = Archive::open(&inside, &[])
        .unwrap()
        .entries()
        .iter()
        .map(|e| e.name.clone())
        .collect();
    assert!(
        !names
            .iter()
            .any(|n| n.ends_with("self.zip") || n.contains(".td-archive-")),
        "{names:?}"
    );

    // 없는 원본
    assert!(compress(&[root.join("nope")], &root.join("n.zip"), &mut |_| true).is_err());
    assert!(!root.join("n.zip").exists());
}

#[cfg(unix)]
#[test]
fn compress_skips_symlinks_and_reports_them() {
    use std::os::unix::fs::symlink;
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    fs::create_dir(root.join("d")).unwrap();
    fs::write(root.join("d/real.txt"), "r").unwrap();
    symlink(root.join("d/real.txt"), root.join("d/link.txt")).unwrap();
    symlink(".", root.join("d/loop")).unwrap();
    let report = compress(&[root.join("d")], &root.join("d.zip"), &mut |_| true).unwrap();
    assert_eq!((report.files, report.dirs, report.skipped_links), (1, 1, 2));
    let names: Vec<String> = Archive::open(&root.join("d.zip"), &[])
        .unwrap()
        .entries()
        .iter()
        .map(|e| e.name.clone())
        .collect();
    assert_eq!(names, ["d", "d/real.txt"]);
}
