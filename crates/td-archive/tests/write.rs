use std::fs;
use std::io::{self, Read};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, UNIX_EPOCH};

use unicode_normalization::UnicodeNormalization;

use td_archive::{edit_in, Archive, ArchiveError, Source, ZipEdit};

fn none() -> Vec<String> {
    vec![]
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

/// 시스템 `unzip -t`가 오류 없이 통과해야 한다.
fn unzip_ok(zip: &Path) {
    sh(
        zip.parent().unwrap(),
        "unzip",
        &["-tq", zip.file_name().unwrap().to_str().unwrap()],
    );
}

/// 외부 도구가 보는 항목 이름(정렬). macOS의 구형 `unzip -Z1`은 비ASCII 이름을 깨뜨려 출력하므로
/// 이름과 내용은 독립 구현인 bsdtar(libarchive)로 읽는다. 무결성 검사는 `unzip -t`가 맡는다.
fn unzip_names(zip: &Path) -> Vec<String> {
    let out = sh(
        zip.parent().unwrap(),
        "tar",
        &["-tf", zip.file_name().unwrap().to_str().unwrap()],
    );
    // macOS의 bsdtar는 이름을 NFD로 돌려주므로 NFC로 맞춰 비교한다.
    let mut v: Vec<String> = String::from_utf8_lossy(&out)
        .lines()
        .map(|l| l.nfc().collect())
        .collect();
    v.sort();
    v
}

fn unzip_p(zip: &Path, entry: &str) -> Vec<u8> {
    let name = zip.file_name().unwrap().to_str().unwrap();
    // bsdtar는 NFD 이름을 내므로 목록에서 NFC가 같은 원본 이름을 찾아 넘긴다.
    let listing = sh(zip.parent().unwrap(), "tar", &["-tf", name]);
    let raw = String::from_utf8_lossy(&listing)
        .lines()
        .find(|l| l.nfc().collect::<String>() == entry)
        .unwrap_or_else(|| panic!("{entry} 항목이 없다"))
        .to_string();
    sh(zip.parent().unwrap(), "tar", &["-xOf", name, &raw])
}

#[test]
fn zip_write_roundtrip_unzip_t() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    let zip = dir.join("new.zip");

    // 로컬 원본: 실행 권한이 있는 파일, 고정된 수정 시각
    let src = dir.join("src.sh");
    fs::write(&src, "#!/bin/sh\necho hi\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&src, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let fixed = UNIX_EPOCH + Duration::from_secs(1_577_934_246); // 2020-01-02 03:04:06 UTC
    fs::File::options()
        .write(true)
        .open(&src)
        .unwrap()
        .set_modified(fixed)
        .unwrap();

    // 1) 처음부터 만든다
    let mut e = ZipEdit::create(&zip).unwrap();
    e.add_file("a.txt", Source::Bytes(b"hello".to_vec()));
    e.add_file(
        "한글/파일.txt",
        Source::Bytes("한글 내용".as_bytes().to_vec()),
    );
    e.add_file("bin/run.sh", Source::Path(src.clone()));
    e.add_file("docs/readme.md", Source::Bytes(b"# doc".to_vec()));
    e.add_dir("empty");
    e.commit().unwrap();
    unzip_ok(&zip);
    assert_eq!(
        unzip_names(&zip),
        [
            "a.txt",
            "bin/run.sh",
            "docs/readme.md",
            "empty/",
            "한글/파일.txt"
        ]
    );
    assert_eq!(unzip_p(&zip, "a.txt"), b"hello");
    assert_eq!(unzip_p(&zip, "한글/파일.txt"), "한글 내용".as_bytes());
    assert_eq!(unzip_p(&zip, "bin/run.sh"), b"#!/bin/sh\necho hi\n");

    let a = Archive::open(&zip, &none()).unwrap();
    let run = a.stat("bin/run.sh").unwrap();
    #[cfg(unix)]
    assert_eq!(run.mode, Some(0o755), "권한을 보존");
    let secs = run
        .modified
        .unwrap()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    assert!(
        (secs - 1_577_934_246).abs() <= 2,
        "수정 시각을 보존(zip은 2초 단위): {secs}"
    );
    assert!(a.stat("empty").unwrap().is_dir);

    // 2) 고친다: 폴더 삭제, 폴더 이름 바꾸기, 파일 덮어쓰기, 새 파일
    let mut e = ZipEdit::open(&zip, &none()).unwrap();
    e.remove("docs");
    e.rename("한글", "국문");
    e.add_file("a.txt", Source::Bytes(b"changed".to_vec()));
    e.add_file("new/x.txt", Source::Bytes(b"x".to_vec()));
    e.commit().unwrap();
    unzip_ok(&zip);
    assert_eq!(
        unzip_names(&zip),
        [
            "a.txt",
            "bin/run.sh",
            "empty/",
            "new/x.txt",
            "국문/파일.txt"
        ]
    );
    assert_eq!(unzip_p(&zip, "a.txt"), b"changed");
    assert_eq!(unzip_p(&zip, "국문/파일.txt"), "한글 내용".as_bytes());
    assert_eq!(
        unzip_p(&zip, "bin/run.sh"),
        b"#!/bin/sh\necho hi\n",
        "건드리지 않은 항목은 그대로"
    );

    // 3) 파일 이름 바꾸기와 빈 폴더 삭제
    let mut e = ZipEdit::open(&zip, &none()).unwrap();
    e.rename("new/x.txt", "new/y.txt").remove("empty");
    e.commit().unwrap();
    unzip_ok(&zip);
    assert_eq!(
        unzip_names(&zip),
        ["a.txt", "bin/run.sh", "new/y.txt", "국문/파일.txt"]
    );

    // 4) 이미 있는 이름으로 create 하면 거부, 임시 파일이 남지 않는다
    assert!(matches!(
        ZipEdit::create(&zip),
        Err(ArchiveError::Exists(_))
    ));
    let leftovers: Vec<_> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".tmp"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn zip_write_edits_zip_made_by_another_tool() {
    // macOS `zip`이 만든 파일(한글 이름을 UTF-8 플래그 없이 저장)을 고쳐도 다른 항목의 이름이 그대로여야 한다.
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src");
    fs::create_dir_all(src.join("폴더")).unwrap();
    fs::write(src.join("폴더/한글.txt"), "기존").unwrap();
    fs::write(src.join("keep.txt"), "keep").unwrap();
    fs::write(src.join("drop.txt"), "drop").unwrap();
    sh(&src, "zip", &["-r", "-q", "../ext.zip", "."]);
    let zip = tmp.path().join("ext.zip");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&zip, fs::Permissions::from_mode(0o640)).unwrap();
    }
    let before = unzip_names(&zip);

    let mut e = ZipEdit::open(&zip, &none()).unwrap();
    e.remove("drop.txt")
        .add_file("added.txt", Source::Bytes("추가".as_bytes().to_vec()));
    e.commit().unwrap();
    unzip_ok(&zip);
    let after = unzip_names(&zip);
    let mut expect: Vec<String> = before.into_iter().filter(|n| n != "drop.txt").collect();
    expect.push("added.txt".into());
    expect.sort();
    assert_eq!(after, expect, "다른 항목의 이름 바이트가 그대로");
    let a = Archive::open(&zip, &none()).unwrap();
    assert_eq!(a.read("폴더/한글.txt").unwrap(), "기존".as_bytes());
    assert_eq!(a.read("added.txt").unwrap(), "추가".as_bytes());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&zip).unwrap().permissions().mode() & 0o777,
            0o640,
            "원본 파일 권한을 유지"
        );
    }
}

struct FailingReader(usize);
impl Read for FailingReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.0 == 0 {
            return Err(io::Error::other("읽기 실패 주입"));
        }
        let n = self.0.min(buf.len()).min(3);
        buf[..n].fill(b'x');
        self.0 -= n;
        Ok(n)
    }
}

#[test]
fn zip_write_failure_keeps_original() {
    let tmp = tempfile::tempdir().unwrap();
    let zip = tmp.path().join("orig.zip");
    let mut e = ZipEdit::create(&zip).unwrap();
    e.add_file("a.txt", Source::Bytes(b"aaa".to_vec()))
        .add_file("b/c.txt", Source::Bytes(b"ccc".to_vec()));
    e.commit().unwrap();
    let before = fs::read(&zip).unwrap();

    // 스트림을 읽다가 실패
    let mut e = ZipEdit::open(&zip, &none()).unwrap();
    e.remove("a.txt")
        .add_file("big.bin", Source::Reader(Box::new(FailingReader(10))));
    assert!(e.commit().is_err());
    assert_eq!(fs::read(&zip).unwrap(), before, "원본 바이트가 그대로");

    // 존재하지 않는 로컬 파일
    let mut e = ZipEdit::open(&zip, &none()).unwrap();
    e.rename("b", "z")
        .add_file("q", Source::Path(tmp.path().join("no-such-file")));
    assert!(e.commit().is_err());
    assert_eq!(fs::read(&zip).unwrap(), before);

    // 원본이 손상된 경우에도 파일을 건드리지 않는다
    let broken = tmp.path().join("broken.zip");
    fs::write(&broken, b"PK\x03\x04 garbage").unwrap();
    let b_before = fs::read(&broken).unwrap();
    let mut e = ZipEdit::open(&broken, &none()).unwrap();
    e.add_file("x", Source::Bytes(vec![1]));
    assert!(e.commit().is_err());
    assert_eq!(fs::read(&broken).unwrap(), b_before);

    // 임시 파일이 남지 않는다
    let names: Vec<String> = fs::read_dir(tmp.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert!(
        names.iter().all(|n| !n.contains(".td-archive-")),
        "{names:?}"
    );
    unzip_ok(&zip);
}

#[test]
fn archive_nested_write_back() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    // inner.zip(x.txt) ⊂ mid.zip(+note.txt) ⊂ top.zip(+top.txt)
    let mut e = ZipEdit::create(&dir.join("inner.zip")).unwrap();
    e.add_file("x.txt", Source::Bytes("원래".as_bytes().to_vec()))
        .add_file("keep.txt", Source::Bytes(b"k".to_vec()));
    e.commit().unwrap();
    let mut e = ZipEdit::create(&dir.join("mid.zip")).unwrap();
    e.add_file("inner.zip", Source::Path(dir.join("inner.zip")))
        .add_file("note.txt", Source::Bytes(b"n".to_vec()));
    e.commit().unwrap();
    let top = dir.join("top.zip");
    let mut e = ZipEdit::create(&top).unwrap();
    e.add_file("mid.zip", Source::Path(dir.join("mid.zip")))
        .add_file("top.txt", Source::Bytes(b"t".to_vec()));
    e.commit().unwrap();

    edit_in(
        &top,
        &["mid.zip".to_string(), "inner.zip".to_string()],
        &none(),
        &mut |z| {
            z.add_file("x.txt", Source::Bytes("수정됨".as_bytes().to_vec()));
            z.add_file("new.txt", Source::Bytes(b"new".to_vec()));
            z.remove("keep.txt");
        },
    )
    .unwrap();

    // 외부 도구로 바깥에서 안쪽으로 한 겹씩 꺼내 확인한다
    unzip_ok(&top);
    assert_eq!(unzip_names(&top), ["mid.zip", "top.txt"]);
    let work = dir.join("work");
    fs::create_dir_all(&work).unwrap();
    fs::write(work.join("mid.zip"), unzip_p(&top, "mid.zip")).unwrap();
    unzip_ok(&work.join("mid.zip"));
    assert_eq!(
        unzip_names(&work.join("mid.zip")),
        ["inner.zip", "note.txt"]
    );
    fs::write(
        work.join("inner.zip"),
        unzip_p(&work.join("mid.zip"), "inner.zip"),
    )
    .unwrap();
    unzip_ok(&work.join("inner.zip"));
    assert_eq!(unzip_names(&work.join("inner.zip")), ["new.txt", "x.txt"]);
    assert_eq!(
        unzip_p(&work.join("inner.zip"), "x.txt"),
        "수정됨".as_bytes()
    );
    assert_eq!(
        unzip_p(&work.join("mid.zip"), "note.txt"),
        b"n",
        "가운데 아카이브의 다른 항목은 그대로"
    );
    assert_eq!(unzip_p(&top, "top.txt"), b"t");

    // 우리 읽기 경로로도 같다
    let a = Archive::open(&top, &none()).unwrap();
    let inner = a
        .open_nested("mid.zip", &none())
        .unwrap()
        .open_nested("inner.zip", &none())
        .unwrap();
    assert_eq!(inner.read("x.txt").unwrap(), "수정됨".as_bytes());

    // 안쪽 편집이 실패하면(없는 중첩 항목) 아무것도 바뀌지 않는다
    let before = fs::read(&top).unwrap();
    assert!(edit_in(
        &top,
        &["mid.zip".to_string(), "missing.zip".to_string()],
        &none(),
        &mut |z| {
            z.add_file("q", Source::Bytes(vec![1]));
        }
    )
    .is_err());
    assert_eq!(fs::read(&top).unwrap(), before);
}

#[test]
fn archive_readonly_errors() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    let src = dir.join("src");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("a.txt"), "a").unwrap();
    sh(&src, "tar", &["-czf", "../a.tar.gz", "."]);
    sh(&src, "tar", &["-czf", "../b.tgz", "."]);
    sh(&src, "tar", &["-cjf", "../c.tar.bz2", "."]);
    sh(&src, "tar", &["-cf", "../d.tar", "."]);

    for (file, kind) in [
        ("a.tar.gz", "tar.gz"),
        ("b.tgz", "tar.gz"),
        ("c.tar.bz2", "tar.bz2"),
        ("d.tar", "tar"),
    ] {
        let p = dir.join(file);
        let before = fs::read(&p).unwrap();
        match ZipEdit::open(&p, &none()) {
            Err(ArchiveError::ReadOnly(k)) => assert_eq!(k, kind, "{file}"),
            other => panic!("{file}: ReadOnly가 아님: {:?}", other.map(|_| ())),
        }
        let err = ZipEdit::open(&p, &none()).err().unwrap().to_string();
        assert!(err.contains("읽기 전용"), "{err}");
        assert_eq!(fs::read(&p).unwrap(), before, "{file}: 파일 불변");
    }

    // zip 안의 tar.gz 를 고치려 하면 거부, 바깥 zip은 불변
    let zip = dir.join("wrap.zip");
    let mut e = ZipEdit::create(&zip).unwrap();
    e.add_file("inner.tar.gz", Source::Path(dir.join("a.tar.gz")));
    e.commit().unwrap();
    let before = fs::read(&zip).unwrap();
    let r = edit_in(&zip, &["inner.tar.gz".to_string()], &none(), &mut |z| {
        z.add_file("q", Source::Bytes(vec![1]));
    });
    assert!(
        matches!(r, Err(ArchiveError::ReadOnly("tar.gz"))),
        "{:?}",
        r.err()
    );
    assert_eq!(fs::read(&zip).unwrap(), before);

    // 그 밖의 오류 종류
    fs::write(dir.join("plain.txt"), "x").unwrap();
    assert!(matches!(
        ZipEdit::open(&dir.join("plain.txt"), &none()),
        Err(ArchiveError::Unsupported(_))
    ));
    assert!(matches!(
        ZipEdit::open(&dir.join("gone.zip"), &none()),
        Err(ArchiveError::NotFound(_))
    ));
    // "Open As": 확장자가 다른 zip을 zip으로 고친다
    fs::copy(&zip, dir.join("disguised.dat")).unwrap();
    let mut e = ZipEdit::open_as_zip(&dir.join("disguised.dat")).unwrap();
    e.add_file("z.txt", Source::Bytes(b"z".to_vec()));
    e.commit().unwrap();
    unzip_ok(&dir.join("disguised.dat"));
    assert!(unzip_names(&dir.join("disguised.dat")).contains(&"z.txt".to_string()));
}
