//! 원격 파일의 앞부분 읽기(Look Up·미리보기)가 전체를 받지 않고 끝나는지 확인한다.

use std::sync::Arc;
use std::time::{Duration, Instant};

use td_archive::CompositeFs;
use td_remote::testing::{ftp::FakeFtp, sftp::FakeSftp};
use td_remote::{FtpSession, RemoteSession, SftpSession};
use td_vfs::{Vfs, VfsPath};

fn data() -> Vec<u8> {
    (0..(8u32 << 20)).map(|i| (i % 251) as u8).collect()
}

fn check(fs: &CompositeFs, url: &str, expected: &[u8]) {
    let started = Instant::now();
    let head = fs.read_head(&VfsPath::new(url), 32).unwrap();
    assert_eq!(head, &expected[..32]);
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "앞부분만 읽는데 오래 걸렸다"
    );
}

#[test]
fn ftp_원격_파일의_앞부분만_읽고_끝난다() {
    let s = FakeFtp::start(true);
    let d = data();
    std::fs::write(s.path("big.bin"), &d).unwrap();
    let fs = CompositeFs::default();
    fs.remote_registry().insert(
        "f",
        Arc::new(FtpSession::connect(s.cfg("u", "p")).unwrap()) as Arc<dyn RemoteSession>,
    );
    check(&fs, "ftp://f/big.bin", &d);
    // 이어서 같은 연결로 다른 일을 할 수 있다.
    assert_eq!(
        fs.stat(&VfsPath::new("ftp://f/big.bin")).unwrap().size,
        d.len() as u64
    );
}

#[test]
fn sftp_원격_파일의_앞부분만_읽고_끝난다() {
    let s = FakeSftp::start();
    let d = data();
    std::fs::write(s.path("big.bin"), &d).unwrap();
    let fs = CompositeFs::default();
    fs.remote_registry().insert(
        "s",
        Arc::new(SftpSession::connect(s.cfg("u", "p")).unwrap()) as Arc<dyn RemoteSession>,
    );
    check(&fs, "sftp://s/big.bin", &d);
    assert_eq!(
        fs.stat(&VfsPath::new("sftp://s/big.bin")).unwrap().size,
        d.len() as u64
    );
}

#[test]
fn 원격과_아카이브_사이_복사는_거부한다() {
    let s = FakeSftp::start();
    std::fs::write(s.path("a.txt"), b"x").unwrap();
    let fs = CompositeFs::default();
    fs.remote_registry().insert(
        "s",
        Arc::new(SftpSession::connect(s.cfg("u", "p")).unwrap()) as Arc<dyn RemoteSession>,
    );
    let tmp = tempfile::tempdir().unwrap();
    let zip = tmp.path().join("a.zip");
    let mut z = td_archive::ZipEdit::create(&zip).unwrap();
    z.add_file("in.txt", td_archive::Source::Bytes(b"z".to_vec()));
    z.commit().unwrap();
    let dest = VfsPath::new(format!("{}!/x.txt", zip.display()));
    assert!(fs
        .copy_file(&VfsPath::new("sftp://s/a.txt"), &dest)
        .is_err());
}

#[cfg(unix)]
#[test]
fn sftp_원격_심볼릭_링크는_폴더는_링크로_두고_들어갈_수_있다고_알리고_파일은_파일로_본다() {
    use td_vfs::{EntryKind, ListOptions};
    let s = FakeSftp::start();
    std::fs::create_dir(s.path("real")).unwrap();
    std::fs::write(s.path("real/f.txt"), b"abc").unwrap();
    std::os::unix::fs::symlink(s.path("real"), s.path("dirlink")).unwrap();
    std::os::unix::fs::symlink(s.path("real/f.txt"), s.path("filelink")).unwrap();
    std::os::unix::fs::symlink(s.path("nowhere"), s.path("broken")).unwrap();
    // 순환: 자기 부모를 가리키는 링크
    std::os::unix::fs::symlink(s.path(""), s.path("real/loop")).unwrap();
    let fs = CompositeFs::default();
    fs.remote_registry().insert(
        "s",
        Arc::new(SftpSession::connect(s.cfg("u", "p")).unwrap()) as Arc<dyn RemoteSession>,
    );
    let list = fs
        .list(
            &VfsPath::new("sftp://s/"),
            &ListOptions { show_hidden: true },
        )
        .unwrap();
    let by = |n: &str| list.iter().find(|e| e.name == n).unwrap().clone();
    assert_eq!(
        (by("dirlink").kind, by("dirlink").link_is_dir),
        (EntryKind::Symlink, true)
    );
    assert_eq!(
        (by("filelink").kind, by("filelink").size),
        (EntryKind::File, 3)
    );
    assert_eq!(
        (by("broken").kind, by("broken").link_is_dir),
        (EntryKind::Symlink, false)
    );
    // 링크를 통해 폴더 안으로 들어갈 수는 있다.
    let inside = fs
        .list(
            &VfsPath::new("sftp://s/dirlink"),
            &ListOptions { show_hidden: true },
        )
        .unwrap();
    assert!(inside.iter().any(|e| e.name == "f.txt"));
}
