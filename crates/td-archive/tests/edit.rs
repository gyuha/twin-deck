use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use td_archive::{start_edit, CompositeFs, Source, ZipEdit};
use td_vfs::VfsPath;

const POLL: Duration = Duration::from_millis(40);

/// 폴링용: 되쓰기가 zip을 원자적으로 교체하는 순간에는 `unzip`이 크기 확인(stat)과 열기(open) 사이에 파일이
/// 바뀌어 EOCD를 못 찾고 실패할 수 있다(외부 도구의 경쟁). 폴링 중의 실패는 "아직"으로 보고, 값이 맞은 뒤에는
/// 아래 엄격한 `unzip_p`/`unzip_ok`로 다시 확인한다.
fn unzip_p_now(zip: &Path, entry: &str) -> Option<String> {
    let out = Command::new("unzip")
        .args(["-p", zip.to_str().unwrap(), entry])
        .env("COPYFILE_DISABLE", "1")
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

fn unzip_p(zip: &Path, entry: &str) -> String {
    let out = Command::new("unzip")
        .args(["-p", zip.to_str().unwrap(), entry])
        .env("COPYFILE_DISABLE", "1")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn unzip_ok(zip: &Path) {
    let out = Command::new("unzip")
        .args(["-tq", zip.to_str().unwrap()])
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stdout)
    );
}

/// 조건이 될 때까지 제한 시간 안에서 기다린다.
fn wait_until(what: &str, mut ok: impl FnMut() -> bool) {
    let end = Instant::now() + Duration::from_secs(10);
    while !ok() {
        assert!(Instant::now() < end, "제한 시간 안에 {what}");
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[test]
fn archive_edit_writes_back() {
    let tmp = tempfile::tempdir().unwrap();
    let zip = tmp.path().join("doc.zip");
    let mut z = ZipEdit::create(&zip).unwrap();
    z.add_file("docs/a.txt", Source::Bytes(b"before".to_vec()));
    z.add_file("keep.txt", Source::Bytes(b"keep".to_vec()));
    z.commit().unwrap();
    let fs_ = CompositeFs::default();
    let path = VfsPath::new(format!("{}!/docs/a.txt", zip.display()));

    let session = start_edit(&fs_, &path, POLL).unwrap();
    let temp = session.temp_path().to_path_buf();
    assert_eq!(temp.file_name().unwrap(), "a.txt");
    assert_eq!(fs::read_to_string(&temp).unwrap(), "before");

    // 편집기(fake)가 제자리에서 저장한다.
    fs::write(&temp, "after in place").unwrap();
    wait_until("제자리 저장이 반영된다", || {
        unzip_p_now(&zip, "docs/a.txt").as_deref() == Some("after in place")
    });
    assert_eq!(unzip_p(&zip, "docs/a.txt"), "after in place");

    // 편집기가 임시 파일에 쓰고 이름을 바꿔 덮어쓰는 방식(원자적 저장)도 반영된다.
    let side = temp.with_file_name("a.txt.swp");
    fs::write(&side, "after atomic save").unwrap();
    fs::rename(&side, &temp).unwrap();
    wait_until("원자적 저장이 반영된다", || {
        unzip_p_now(&zip, "docs/a.txt").as_deref() == Some("after atomic save")
    });
    assert_eq!(unzip_p(&zip, "docs/a.txt"), "after atomic save");

    assert_eq!(unzip_p(&zip, "keep.txt"), "keep");
    unzip_ok(&zip);
    assert_eq!(session.last_error(), None);

    // 세션을 닫으면 임시 파일이 지워지고 더는 반영하지 않는다.
    drop(session);
    assert!(!temp.exists());
    unzip_ok(&zip);
}

#[test]
fn archive_edit_writes_back_nested_and_reports_failures() {
    let tmp = tempfile::tempdir().unwrap();
    let inner = tmp.path().join("inner.zip");
    let mut z = ZipEdit::create(&inner).unwrap();
    z.add_file("n.txt", Source::Bytes(b"one".to_vec()));
    z.commit().unwrap();
    let outer = tmp.path().join("outer.zip");
    let mut z = ZipEdit::create(&outer).unwrap();
    z.add_file("inner.zip", Source::Path(inner.clone()));
    z.commit().unwrap();
    fs::remove_file(&inner).unwrap();

    let fs_ = CompositeFs::default();
    let path = VfsPath::new(format!("{}!/inner.zip!/n.txt", outer.display()));
    let session = start_edit(&fs_, &path, POLL).unwrap();
    fs::write(session.temp_path(), "two").unwrap();
    wait_until("중첩 zip까지 반영된다", || {
        let scratch = tempfile::tempdir().unwrap();
        let out = Command::new("unzip")
            .args(["-p", outer.to_str().unwrap(), "inner.zip"])
            .output()
            .unwrap();
        let p = scratch.path().join("inner.zip");
        fs::write(&p, out.stdout).unwrap();
        Command::new("unzip")
            .args(["-p", p.to_str().unwrap(), "n.txt"])
            .output()
            .map(|o| o.stdout == b"two")
            .unwrap_or(false)
    });
    unzip_ok(&outer);

    // 폴더(아카이브 루트)나 없는 항목은 편집기로 열지 않는다.
    assert!(start_edit(&fs_, &VfsPath::new(format!("{}!", outer.display())), POLL).is_err());
    assert!(start_edit(
        &fs_,
        &VfsPath::new(format!("{}!/nope.txt", outer.display())),
        POLL
    )
    .is_err());

    // 되쓰기가 실패하면 오류로 남는다(아카이브가 사라진 경우).
    fs::remove_file(&outer).unwrap();
    fs::write(session.temp_path(), "three").unwrap();
    wait_until("실패가 기록된다", || session.last_error().is_some());
}
