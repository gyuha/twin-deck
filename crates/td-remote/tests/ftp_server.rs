//! 같은 프로세스에서 띄운 가짜 FTP 서버(로컬 TCP)에 실제 소켓으로 접속해 `FtpSession`을 검증한다.

use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;

use td_remote::testing::ftp::{FakeFtp as Server, PASS, USER};
use td_remote::{FtpConfig, FtpSession, RemoteError, RemoteKind, RemoteSession};

#[test]
fn 잘못된_비밀번호는_인증_오류다() {
    let s = Server::start(true);
    let err = FtpSession::connect(s.cfg(USER, "틀림")).err().unwrap();
    assert_eq!(err, RemoteError::Auth);
}

#[test]
fn 없는_사용자도_인증_오류다() {
    let s = Server::start(true);
    let err = FtpSession::connect(s.cfg("nobody", PASS)).err().unwrap();
    assert_eq!(err, RemoteError::Auth);
}

#[test]
fn 닫힌_포트는_연결_불가_오류다() {
    let port = {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let cfg = FtpConfig {
        host: "127.0.0.1".into(),
        port,
        user: USER.into(),
        password: PASS.into(),
    };
    assert_eq!(
        FtpSession::connect(cfg).err().unwrap(),
        RemoteError::Unreachable
    );
}

#[test]
fn 홈_폴더를_돌려준다() {
    let s = Server::start(true);
    assert_eq!(s.connect().home().unwrap(), "/");
}

#[test]
fn 목록은_이름_종류_크기_수정_시각을_준다() {
    let s = Server::start(true);
    fs::write(s.path("a.txt"), b"hello").unwrap();
    fs::create_dir(s.path("sub")).unwrap();
    let mut list = s.connect().list("/").unwrap();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    assert_eq!(list.len(), 2);
    assert_eq!(
        (list[0].name.as_str(), list[0].kind, list[0].size),
        ("a.txt", RemoteKind::File, 5)
    );
    assert_eq!(list[1].kind, RemoteKind::Dir);
    assert!(list[0].modified.is_some());
}

#[test]
fn mlsd를_모르는_서버는_list로_읽는다() {
    let s = Server::start(false);
    fs::write(s.path("a.txt"), b"hello").unwrap();
    fs::create_dir(s.path("sub")).unwrap();
    let mut list = s.connect().list("/").unwrap();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    assert_eq!(list.len(), 2);
    assert_eq!((list[0].kind, list[0].size), (RemoteKind::File, 5));
    assert_eq!(list[1].kind, RemoteKind::Dir);
}

#[test]
fn 한글_파일명을_목록에서_읽는다() {
    let s = Server::start(true);
    fs::write(s.path("한글 파일.txt"), b"x").unwrap();
    let list = s.connect().list("/").unwrap();
    assert_eq!(list[0].name, "한글 파일.txt");
}

#[test]
fn 없는_폴더의_목록은_찾을_수_없음이다() {
    let s = Server::start(true);
    assert!(matches!(
        s.connect().list("/nope").unwrap_err(),
        RemoteError::NotFound(_)
    ));
}

#[test]
fn stat은_파일_폴더_루트를_구분하고_없으면_찾을_수_없음이다() {
    let s = Server::start(true);
    fs::create_dir(s.path("d")).unwrap();
    fs::write(s.path("d/f.bin"), b"abc").unwrap();
    let c = s.connect();
    assert_eq!(c.stat("/d").unwrap().kind, RemoteKind::Dir);
    let f = c.stat("/d/f.bin").unwrap();
    assert_eq!((f.kind, f.size), (RemoteKind::File, 3));
    assert_eq!(c.stat("/").unwrap().kind, RemoteKind::Dir);
    assert!(matches!(
        c.stat("/d/none").unwrap_err(),
        RemoteError::NotFound(_)
    ));
}

#[test]
fn 중첩_폴더를_만들고_다시_만들어도_성공한다() {
    let s = Server::start(true);
    let c = s.connect();
    c.mkdir_all("/a/b/c").unwrap();
    assert!(s.path("a/b/c").is_dir());
    c.mkdir_all("/a/b/c").unwrap();
}

#[test]
fn 같은_이름의_파일이_있으면_폴더_만들기는_실패한다() {
    let s = Server::start(true);
    fs::write(s.path("file"), b"x").unwrap();
    assert!(s.connect().mkdir_all("/file/sub").is_err());
}

#[test]
fn 빈_파일을_만들고_다시_만들면_이미_존재함이다() {
    let s = Server::start(true);
    let c = s.connect();
    c.create_empty("/empty.txt").unwrap();
    assert_eq!(fs::metadata(s.path("empty.txt")).unwrap().len(), 0);
    assert!(matches!(
        c.create_empty("/empty.txt").unwrap_err(),
        RemoteError::AlreadyExists(_)
    ));
}

#[test]
fn 이름을_바꾼다() {
    let s = Server::start(true);
    fs::write(s.path("old.txt"), b"data").unwrap();
    s.connect().rename("/old.txt", "/new.txt").unwrap();
    assert!(!s.path("old.txt").exists());
    assert_eq!(fs::read(s.path("new.txt")).unwrap(), b"data");
}

#[test]
fn 파일을_지우고_없는_파일은_찾을_수_없음이다() {
    let s = Server::start(true);
    fs::write(s.path("x"), b"1").unwrap();
    let c = s.connect();
    c.remove_file("/x").unwrap();
    assert!(!s.path("x").exists());
    assert!(matches!(
        c.remove_file("/x").unwrap_err(),
        RemoteError::NotFound(_)
    ));
}

#[test]
fn 폴더를_재귀로_지운다() {
    let s = Server::start(true);
    fs::create_dir_all(s.path("d/e/f")).unwrap();
    fs::write(s.path("d/1.txt"), b"1").unwrap();
    fs::write(s.path("d/e/f/2.txt"), b"2").unwrap();
    s.connect().remove_dir_all("/d").unwrap();
    assert!(!s.path("d").exists());
}

#[test]
fn 업로드한_파일을_다운로드하면_바이트가_같다() {
    let s = Server::start(true);
    let c = s.connect();
    // 청크 경계를 넘도록 1MiB보다 크게, 줄바꿈 바이트도 섞는다.
    let data: Vec<u8> = (0..(1 << 20) + 12_345u32)
        .map(|i| (i % 251) as u8)
        .chain(*b"\r\n\n\r")
        .collect();
    let mut w = c.write("/big.bin").unwrap();
    w.write_all(&data).unwrap();
    w.finish().unwrap();
    assert_eq!(fs::read(s.path("big.bin")).unwrap(), data);
    let mut back = Vec::new();
    c.read("/big.bin").unwrap().read_to_end(&mut back).unwrap();
    assert_eq!(back, data);
}

#[test]
fn 없는_파일을_읽으면_찾을_수_없음이다() {
    let s = Server::start(true);
    assert!(matches!(
        s.connect().read("/none").err().unwrap(),
        RemoteError::NotFound(_)
    ));
}

#[test]
fn 없는_폴더에_쓰면_오류다() {
    let s = Server::start(true);
    assert!(s.connect().write("/no/dir/x").is_err());
}
