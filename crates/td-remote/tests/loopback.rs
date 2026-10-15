//! 루프백 데몬을 띄워 원격 클라이언트가 로컬과 같은 결과를 내는지 확인한다.

use std::fs;
use std::sync::Arc;

use td_remote::{ConnectError, RemoteFs, Server, PROTOCOL_VERSION};
use td_vfs::{ListOptions, LocalFs, Vfs, VfsError, VfsPath};

const TOKEN: &str = "test-token";

fn serve() -> String {
    let server = Server::bind("127.0.0.1:0", TOKEN.to_string(), Arc::new(LocalFs)).unwrap();
    let addr = server.local_addr().to_string();
    server.spawn();
    addr
}

#[test]
fn 틀린_토큰은_인증_오류로_거부한다() {
    let addr = serve();
    let err = RemoteFs::connect(&addr, "wrong").err().unwrap();
    assert!(matches!(err, ConnectError::Token), "{err:?}");
}

#[test]
fn 프로토콜_버전이_다르면_버전_오류로_거부한다() {
    let addr = serve();
    let err = RemoteFs::connect_with_version(&addr, TOKEN, PROTOCOL_VERSION + 1)
        .err()
        .unwrap();
    match err {
        ConnectError::Version { server, client } => {
            assert_eq!(server, PROTOCOL_VERSION);
            assert_eq!(client, PROTOCOL_VERSION + 1);
        }
        other => panic!("버전 오류가 아님: {other:?}"),
    }
}

#[test]
fn 목록_stat_read_head가_로컬과_같다() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), "hello 원격").unwrap();
    fs::create_dir(dir.path().join("하위")).unwrap();
    fs::write(dir.path().join(".hidden"), "x").unwrap();
    let addr = serve();
    let remote = RemoteFs::connect(&addr, TOKEN).unwrap();
    let root = VfsPath::new(dir.path());

    for show_hidden in [false, true] {
        let opts = ListOptions { show_hidden };
        let mut want = LocalFs.list(&root, &opts).unwrap();
        let mut got = remote.list(&root, &opts).unwrap();
        want.sort_by(|a, b| a.name.cmp(&b.name));
        got.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(got, want);
    }

    let file = root.join("a.txt");
    assert_eq!(remote.stat(&file).unwrap(), LocalFs.stat(&file).unwrap());
    assert_eq!(remote.read_head(&file, 5).unwrap(), b"hello");
    assert_eq!(
        remote.read_head(&file, 1000).unwrap(),
        "hello 원격".as_bytes()
    );
}

#[test]
fn 큰_파일을_read_to로_그대로_받는다() {
    let dir = tempfile::tempdir().unwrap();
    // 청크 크기의 몇 배가 되도록 5MB, 내용은 위치마다 다르게.
    let data: Vec<u8> = (0..5 * 1024 * 1024u32)
        .map(|i| (i * 31 % 251) as u8)
        .collect();
    fs::write(dir.path().join("big.bin"), &data).unwrap();
    let addr = serve();
    let remote = RemoteFs::connect(&addr, TOKEN).unwrap();

    let mut out = Vec::new();
    let n = remote
        .read_to(&VfsPath::new(dir.path().join("big.bin")), &mut out)
        .unwrap();
    assert_eq!(n, data.len() as u64);
    assert!(out == data, "받은 바이트가 원본과 다르다");

    // 같은 연결로 다음 요청도 된다.
    assert!(remote.stat(&VfsPath::new(dir.path())).is_ok());
}

#[test]
fn 없는_경로는_not_found이고_쓰기는_지원하지_않는다() {
    let dir = tempfile::tempdir().unwrap();
    let addr = serve();
    let remote = RemoteFs::connect(&addr, TOKEN).unwrap();
    let missing = VfsPath::new(dir.path().join("없음.txt"));

    assert!(matches!(remote.stat(&missing), Err(VfsError::NotFound(_))));
    let mut out = Vec::new();
    assert!(matches!(
        remote.read_to(&missing, &mut out),
        Err(VfsError::NotFound(_))
    ));

    let err = remote
        .mkdir(&VfsPath::new(dir.path().join("새폴더")))
        .unwrap_err();
    assert!(err.to_string().contains("지원하지 않음"), "{err}");
    assert!(!dir.path().join("새폴더").exists());
}

/// 처음 몇 바이트만 받고 실패하는 출력(디스크가 찬 경우 등).
struct FailingWriter;

impl std::io::Write for FailingWriter {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::other("디스크 가득 참"))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn 받는_쪽_쓰기가_실패해도_연결은_다음_요청에_쓸_수_있다() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("big.bin"), vec![7u8; 1024 * 1024]).unwrap();
    fs::write(dir.path().join("a.txt"), "다음").unwrap();
    let addr = serve();
    let remote = RemoteFs::connect(&addr, TOKEN).unwrap();

    let err = remote
        .read_to(
            &VfsPath::new(dir.path().join("big.bin")),
            &mut FailingWriter,
        )
        .unwrap_err();
    assert!(err.to_string().contains("디스크 가득 참"), "{err}");

    let head = remote
        .read_head(&VfsPath::new(dir.path().join("a.txt")), 100)
        .unwrap();
    assert_eq!(head, "다음".as_bytes());
}

#[test]
fn 서버가_돌려준_오류는_연결을_끊지_않고_없는_주소는_연결_오류다() {
    let dir = tempfile::tempdir().unwrap();
    let addr = serve();
    let remote = RemoteFs::connect(&addr, TOKEN).unwrap();
    assert!(remote.stat(&VfsPath::new(dir.path())).is_ok());
    assert!(!remote.is_broken());
    // 서버 응답 오류(NotFound)는 연결을 끊지 않는다.
    let _ = remote.stat(&VfsPath::new(dir.path().join("없음")));
    assert!(!remote.is_broken());

    let closed = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let dead = closed.local_addr().unwrap().to_string();
    drop(closed);
    assert!(matches!(
        RemoteFs::connect(&dead, TOKEN),
        Err(ConnectError::Io(_))
    ));
}
