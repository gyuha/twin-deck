use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::Command;

use td_archive::{
    join_archive_path, kind_for_name, split_archive_path, Archive, ArchiveError, Kind,
};

fn none() -> Vec<String> {
    vec![]
}

/// 외부 프로그램을 실행하고 실패하면 테스트를 실패시킨다(도구가 없으면 역시 실패 — 검증을 건너뛰지 않는다).
fn run(dir: &Path, program: &str, args: &[&str]) {
    let out = Command::new(program)
        .args(args)
        .current_dir(dir)
        // macOS의 tar/zip이 `._*` 메타데이터 항목을 끼워 넣지 않게 한다.
        .env("COPYFILE_DISABLE", "1")
        .output()
        .unwrap_or_else(|e| panic!("{program} 실행 불가: {e}"));
    assert!(
        out.status.success(),
        "{program} {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// 폴더, 파일, 한글 이름, 빈 폴더가 든 표본 트리.
fn sample_tree(root: &Path) {
    fs::create_dir_all(root.join("docs/deep")).unwrap();
    fs::create_dir_all(root.join("empty")).unwrap();
    fs::write(root.join("a.txt"), "hello").unwrap();
    fs::write(root.join("docs/readme.md"), "# 제목\n").unwrap();
    fs::write(root.join("docs/deep/한글.txt"), "한글 내용").unwrap();
}

#[test]
fn archive_path_split() {
    let files = ["/data/a.zip", "/data/wow!/b.tar.gz", "/x/real.zip"];
    let is_file = |p: &str| files.contains(&p);
    let split = |s: &str| split_archive_path(s, &none(), &is_file);

    let ap = split("/data/a.zip!/docs/readme.md").unwrap();
    assert_eq!(
        (ap.outer.as_str(), ap.nested.len(), ap.inner.as_str()),
        ("/data/a.zip", 0, "docs/readme.md")
    );
    assert_eq!(split("/data/a.zip!/").unwrap().inner, "", "루트");
    assert_eq!(split("/data/a.zip!").unwrap().inner, "", "끝의 !도 루트");
    assert_eq!(
        split("/data/a.zip!/docs/").unwrap().inner,
        "docs",
        "끝의 /는 무시"
    );

    // 중첩
    let ap = split("/data/a.zip!/in/b.zip!/c/d.txt").unwrap();
    assert_eq!(ap.nested, ["in/b.zip"]);
    assert_eq!(ap.inner, "c/d.txt");
    let ap = split("/data/a.zip!/x.zip!/y.tar.gz!/z").unwrap();
    assert_eq!(ap.nested, ["x.zip", "y.tar.gz"]);
    assert_eq!(join_archive_path(&ap), "/data/a.zip!/x.zip!/y.tar.gz!/z");

    // 이름에 !/ 가 든 실제 폴더 안의 아카이브
    let ap = split("/data/wow!/b.tar.gz!/f").unwrap();
    assert_eq!(ap.outer, "/data/wow!/b.tar.gz");

    // 아카이브가 아닌 경로, 존재하지 않는 아카이브, 확장자가 아카이브가 아닌 경계
    assert!(split("/data/plain/file.txt").is_none());
    assert!(
        split("/data/missing.zip!/x").is_none(),
        "실제 파일이 아니면 로컬 경로"
    );
    assert!(
        split("/data/wow!/plain.txt").is_none(),
        "wow 는 아카이브 이름이 아니다"
    );
    assert!(split("/x/real.zip.bak!/a").is_none());

    // 추가 확장자 설정
    let extra = vec!["docx".to_string()];
    let with_docx = |p: &str| p == "/d/report.docx";
    assert!(split_archive_path("/d/report.docx!/word", &extra, &with_docx).is_some());
    assert!(split_archive_path("/d/report.docx!/word", &none(), &with_docx).is_none());

    // 확장자 판별
    let k = |n: &str| kind_for_name(n, &none());
    assert_eq!(k("A.ZIP"), Some(Kind::Zip));
    assert_eq!(k("x.jar"), Some(Kind::Zip));
    assert_eq!(k("x.sublime-package"), Some(Kind::Zip));
    assert_eq!(k("x.tar.gz"), Some(Kind::TarGz));
    assert_eq!(k("x.tgz"), Some(Kind::TarGz));
    assert_eq!(k("x.tar.bz2"), Some(Kind::TarBz2));
    assert_eq!(k("x.tar"), Some(Kind::Tar));
    assert_eq!(k(".zip"), None, "확장자만 있는 이름");
    assert_eq!(k("zip"), None);
    assert_eq!(k("x.rar"), None, "rar는 지원하지 않는다");
    assert!(!Kind::TarGz.writable() && Kind::Zip.writable());
}

#[test]
fn zip_read_external_zip_cli() {
    // 시스템 `zip` 명령이 만든 파일을 읽는다 — 우리 코드가 만든 파일이 아닌 독립적인 입력.
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src");
    sample_tree(&src);
    run(&src, "zip", &["-r", "-q", "../out.zip", "."]);

    let a = Archive::open(&tmp.path().join("out.zip"), &none()).unwrap();
    assert_eq!(a.kind(), Kind::Zip);
    let names: Vec<String> = a.list("").iter().map(|e| e.name.clone()).collect();
    assert_eq!(names, ["a.txt", "docs", "empty"]);
    assert_eq!(a.read("docs/readme.md").unwrap(), "# 제목\n".as_bytes());
    assert_eq!(
        a.read("docs/deep/한글.txt").unwrap(),
        "한글 내용".as_bytes()
    );
    assert!(a.stat("empty").unwrap().is_dir);
}

#[test]
fn zip_read_list_and_extract() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("t.zip");
    {
        // 폴더 항목 없이 경로만 있는 zip (암묵적 폴더)과 명시적 폴더 항목을 섞는다.
        let mut w = zip::ZipWriter::new(fs::File::create(&path).unwrap());
        let o = zip::write::SimpleFileOptions::default().unix_permissions(0o640);
        w.start_file("top.txt", o).unwrap();
        w.write_all(b"top").unwrap();
        w.start_file("a/b/deep.txt", o).unwrap();
        w.write_all(b"deep").unwrap();
        w.start_file("a/한글 이름.txt", o).unwrap();
        w.write_all("한글".as_bytes()).unwrap();
        w.add_directory("explicit/", o).unwrap();
        w.finish().unwrap();
    }
    let a = Archive::open(&path, &none()).unwrap();

    let root: Vec<(String, bool)> = a
        .list("")
        .iter()
        .map(|e| (e.name.clone(), e.is_dir))
        .collect();
    assert_eq!(
        root,
        [
            ("a".into(), true),
            ("explicit".into(), true),
            ("top.txt".into(), false)
        ]
    );
    let in_a: Vec<String> = a.list("a").iter().map(|e| e.name.clone()).collect();
    assert_eq!(in_a, ["a/b", "a/한글 이름.txt"]);
    assert_eq!(a.list("/a/b/").len(), 1, "앞뒤 / 는 무시");
    assert!(a.list("nope").is_empty());

    let f = a.stat("a/b/deep.txt").unwrap();
    assert_eq!((f.is_dir, f.size, f.mode), (false, 4, Some(0o640)));
    assert!(f.modified.is_some());
    assert!(a.stat("a/b").unwrap().is_dir, "암묵적 폴더");
    assert!(a.stat("a/none").is_none());
    assert!(a.stat("").unwrap().is_dir, "루트");

    assert_eq!(a.read("a/한글 이름.txt").unwrap(), "한글".as_bytes());
    assert!(
        matches!(a.read("a"), Err(ArchiveError::NotFound(_))),
        "폴더는 읽을 수 없다"
    );
    assert!(matches!(a.read("zzz"), Err(ArchiveError::NotFound(_))));

    // 전체 추출
    let dest = tmp.path().join("out");
    let r = a.extract_all(&dest).unwrap();
    assert_eq!((r.files, r.dirs), (3, 1));
    assert_eq!(
        fs::read_to_string(dest.join("a/b/deep.txt")).unwrap(),
        "deep"
    );
    assert!(dest.join("explicit").is_dir());
    // 덮어쓰지 않는다
    assert!(matches!(a.extract_all(&dest), Err(ArchiveError::Exists(_))));
    assert_eq!(fs::read_to_string(dest.join("top.txt")).unwrap(), "top");

    // 아카이브가 아닌 파일
    fs::write(tmp.path().join("bad.zip"), "not a zip").unwrap();
    assert!(matches!(
        Archive::open(&tmp.path().join("bad.zip"), &none()),
        Err(ArchiveError::Format(_))
    ));
    assert!(matches!(
        Archive::open(&tmp.path().join("x.rar"), &none()),
        Err(ArchiveError::Unsupported(_))
    ));
}

#[test]
fn tar_gz_read() {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src");
    sample_tree(&src);
    run(&src, "tar", &["-czf", "../a.tar.gz", "."]);
    run(&src, "tar", &["-czf", "../b.tgz", "a.txt", "docs"]);
    run(&src, "tar", &["-cjf", "../c.tar.bz2", "."]);
    run(&src, "tar", &["-cf", "../d.tar", "docs"]);

    for (file, kind, top) in [
        ("a.tar.gz", Kind::TarGz, vec!["a.txt", "docs", "empty"]),
        ("b.tgz", Kind::TarGz, vec!["a.txt", "docs"]),
        ("c.tar.bz2", Kind::TarBz2, vec!["a.txt", "docs", "empty"]),
        ("d.tar", Kind::Tar, vec!["docs"]),
    ] {
        let a = Archive::open(&tmp.path().join(file), &none()).unwrap();
        assert_eq!(a.kind(), kind, "{file}");
        let names: Vec<String> = a.list("").iter().map(|e| e.name.clone()).collect();
        assert_eq!(names, top, "{file}");
        assert_eq!(
            a.read("docs/deep/한글.txt").unwrap(),
            "한글 내용".as_bytes(),
            "{file}"
        );
        assert!(a.stat("docs/deep").unwrap().is_dir, "{file}");
        assert!(
            matches!(a.read("docs"), Err(ArchiveError::NotFound(_))),
            "{file}"
        );
    }
    let a = Archive::open(&tmp.path().join("a.tar.gz"), &none()).unwrap();
    let dest = tmp.path().join("x");
    let r = a.extract_all(&dest).unwrap();
    assert_eq!(r.files, 3);
    assert_eq!(
        fs::read_to_string(dest.join("docs/readme.md")).unwrap(),
        "# 제목\n"
    );
}

#[test]
fn archive_nested_read() {
    let tmp = tempfile::tempdir().unwrap();
    let inner_src = tmp.path().join("inner");
    fs::create_dir_all(inner_src.join("d")).unwrap();
    fs::write(inner_src.join("d/x.txt"), "안쪽").unwrap();
    run(&inner_src, "zip", &["-r", "-q", "../inner.zip", "."]);
    let mid = tmp.path().join("mid");
    fs::create_dir_all(&mid).unwrap();
    fs::copy(tmp.path().join("inner.zip"), mid.join("inner.zip")).unwrap();
    fs::write(mid.join("note.txt"), "n").unwrap();
    run(&mid, "zip", &["-r", "-q", "../outer.zip", "."]);
    // tar.gz 안의 zip도
    run(&mid, "tar", &["-czf", "../outer.tgz", "."]);

    for file in ["outer.zip", "outer.tgz"] {
        let outer = Archive::open(&tmp.path().join(file), &none()).unwrap();
        let inner = outer.open_nested("inner.zip", &none()).unwrap();
        assert_eq!(inner.kind(), Kind::Zip, "{file}");
        assert_eq!(inner.read("d/x.txt").unwrap(), "안쪽".as_bytes(), "{file}");
        assert_eq!(inner.list("").len(), 1);
        // 3단계
        assert!(matches!(
            outer.open_nested("note.txt", &none()),
            Err(ArchiveError::Unsupported(_))
        ));
        assert!(matches!(
            outer.open_nested("nope.zip", &none()),
            Err(ArchiveError::NotFound(_))
        ));
    }
    // 중첩의 중첩
    let l2 = tmp.path().join("l2");
    fs::create_dir_all(&l2).unwrap();
    fs::copy(tmp.path().join("outer.zip"), l2.join("outer.zip")).unwrap();
    run(&l2, "zip", &["-q", "../top.zip", "outer.zip"]);
    let top = Archive::open(&tmp.path().join("top.zip"), &none()).unwrap();
    let outer = top.open_nested("outer.zip", &none()).unwrap();
    let inner = outer.open_nested("inner.zip", &none()).unwrap();
    assert_eq!(inner.read("d/x.txt").unwrap(), "안쪽".as_bytes());
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in data {
        crc ^= u32::from(b);
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

/// 라이브러리가 이름을 정리해 버리지 못하도록 zip 바이트를 직접 조립한다(저장 방식, 압축 없음).
/// `unix_mode`가 있으면 그 값을 external attributes에 넣는다(심볼릭 링크 = 0o120777).
fn raw_zip(entries: &[(&str, &[u8], Option<u32>)]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for (name, data, mode) in entries {
        let offset = out.len() as u32;
        let crc = crc32(data);
        let n = name.as_bytes();
        out.extend([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0x21]);
        out.extend(crc.to_le_bytes());
        out.extend((data.len() as u32).to_le_bytes());
        out.extend((data.len() as u32).to_le_bytes());
        out.extend((n.len() as u16).to_le_bytes());
        out.extend(0u16.to_le_bytes());
        out.extend(n);
        out.extend(*data);

        central.extend([
            0x50, 0x4b, 0x01, 0x02, 20, 3, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0x21,
        ]);
        central.extend(crc.to_le_bytes());
        central.extend((data.len() as u32).to_le_bytes());
        central.extend((data.len() as u32).to_le_bytes());
        central.extend((n.len() as u16).to_le_bytes());
        central.extend([0u8; 2 + 2 + 2 + 2]); // extra 길이, comment 길이, disk, internal attrs
        central.extend((mode.unwrap_or(0o100644) << 16).to_le_bytes());
        central.extend(offset.to_le_bytes());
        central.extend(n);
    }
    let cd_offset = out.len() as u32;
    let cd_size = central.len() as u32;
    out.extend(central);
    out.extend([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]);
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend((entries.len() as u16).to_le_bytes());
    out.extend(cd_size.to_le_bytes());
    out.extend(cd_offset.to_le_bytes());
    out.extend(0u16.to_le_bytes());
    out
}

fn evil_zip(path: &Path, name: &str, symlink: bool) {
    let bytes = if symlink {
        raw_zip(&[
            ("good.txt", b"good", None),
            (name, b"/etc/passwd", Some(0o120777)),
        ])
    } else {
        raw_zip(&[("good.txt", b"good", None), (name, b"pwned", None)])
    };
    fs::write(path, bytes).unwrap();
}

#[test]
fn raw_zip_builder_makes_valid_zips() {
    // 조립기가 올바른 zip을 만드는지 시스템 unzip으로 확인한다(악성 입력을 믿을 수 있게).
    let tmp = tempfile::tempdir().unwrap();
    let p = tmp.path().join("raw.zip");
    fs::write(
        &p,
        raw_zip(&[("a.txt", b"hello", None), ("d/b.txt", b"world", None)]),
    )
    .unwrap();
    run(tmp.path(), "unzip", &["-tq", "raw.zip"]);
    let a = Archive::open(&p, &none()).unwrap();
    assert_eq!(a.read("d/b.txt").unwrap(), b"world");
    // 악성 이름은 이름 그대로 저장된다(우리 파서가 raw 이름을 본다)
    let p = tmp.path().join("evil.zip");
    evil_zip(&p, "../x.txt", false);
    let a = Archive::open(&p, &none()).unwrap();
    assert!(a
        .entries()
        .iter()
        .any(|e| e.name == "../x.txt".trim_matches('/') || e.name.contains("x.txt")));
}

#[test]
fn zip_slip_rejected() {
    let tmp = tempfile::tempdir().unwrap();
    let sandbox = tmp.path().join("sandbox");
    fs::create_dir_all(&sandbox).unwrap();
    let dest = sandbox.join("dest");
    // 대상 폴더 밖에 무언가 생기는지 볼 sentinel 위치들(모두 tempdir 안)
    let sentinels = [
        sandbox.join("evil.txt"),
        tmp.path().join("evil.txt"),
        tmp.path().join("abs_evil.txt"),
    ];

    let abs = tmp.path().join("abs_evil.txt").display().to_string();
    let cases: Vec<(String, bool)> = vec![
        ("../evil.txt".into(), false),
        ("../../evil.txt".into(), false),
        ("a/../../evil.txt".into(), false),
        (abs, false),
        ("..\\evil.txt".into(), false),
        ("a\\..\\..\\evil.txt".into(), false),
        ("C:\\evil.txt".into(), false),
        ("link".into(), true),
    ];
    for (name, symlink) in cases {
        let z = tmp.path().join("evil.zip");
        evil_zip(&z, &name, symlink);
        let a = Archive::open(&z, &none()).unwrap();
        let err = a.extract_all(&dest).unwrap_err();
        assert!(
            matches!(err, ArchiveError::Unsafe { .. }),
            "{name:?}: {err}"
        );
        // 하나라도 위험하면 좋은 항목(good.txt)도 쓰지 않는다
        assert!(
            !dest.exists() || fs::read_dir(&dest).unwrap().next().is_none(),
            "{name:?}: 대상 폴더에 무언가 써졌다"
        );
        for s in &sentinels {
            assert!(
                !s.exists(),
                "{name:?}: 대상 폴더 밖에 {} 이(가) 생겼다",
                s.display()
            );
        }
    }

    // tar에 든 심볼릭 링크도 거부한다 (시스템 tar로 만든 링크)
    let src = tmp.path().join("tsrc");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("f"), "x").unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("/etc/passwd", src.join("ln")).unwrap();
        run(&src, "tar", &["-czf", "../ln.tgz", "."]);
        let a = Archive::open(&tmp.path().join("ln.tgz"), &none()).unwrap();
        assert!(matches!(
            a.extract_all(&sandbox.join("t")),
            Err(ArchiveError::Unsafe { .. })
        ));
        assert!(
            !sandbox.join("t").exists()
                || fs::read_dir(sandbox.join("t")).unwrap().next().is_none()
        );
    }

    // 안전한 zip은 정상 추출된다(대조군)
    let ok = tmp.path().join("ok.zip");
    evil_zip(&ok, "sub/fine.txt", false);
    let a = Archive::open(&ok, &none()).unwrap();
    a.extract_all(&sandbox.join("ok")).unwrap();
    assert_eq!(
        fs::read_to_string(sandbox.join("ok/sub/fine.txt")).unwrap(),
        "pwned"
    );
}
