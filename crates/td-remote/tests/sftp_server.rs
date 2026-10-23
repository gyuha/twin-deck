//! 같은 프로세스에서 띄운 가짜 SFTP 서버(russh 서버 + SFTP 서브시스템)에 실제 TCP로 접속해 `SftpSession`을 검증한다.

use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;

use td_remote::testing::sftp::{FakeSftp as Fixture, PASS, USER};
use td_remote::{RemoteError, RemoteKind, RemoteSession, SftpConfig, SftpSession};

#[test]
fn 잘못된_비밀번호는_인증_오류다() {
    let s = Fixture::start();
    assert_eq!(
        SftpSession::connect(s.cfg(USER, "틀림")).err().unwrap(),
        RemoteError::Auth
    );
}

#[test]
fn 없는_사용자도_인증_오류다() {
    let s = Fixture::start();
    assert_eq!(
        SftpSession::connect(s.cfg("nobody", PASS)).err().unwrap(),
        RemoteError::Auth
    );
}

#[test]
fn 닫힌_포트는_연결_불가_오류다() {
    let port = {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let cfg = SftpConfig {
        host: "127.0.0.1".into(),
        port,
        user: USER.into(),
        password: PASS.into(),
        keepalive: Some(td_remote::KEEPALIVE_INTERVAL),
        host_key: Default::default(),
    };
    assert_eq!(
        SftpSession::connect(cfg).err().unwrap(),
        RemoteError::Unreachable
    );
}

#[test]
fn 홈_폴더를_돌려준다() {
    let s = Fixture::start();
    assert_eq!(s.connect().home().unwrap(), "/");
}

#[test]
fn 목록은_이름_종류_크기_수정_시각을_준다() {
    let s = Fixture::start();
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
fn 한글_파일명을_목록에서_읽는다() {
    let s = Fixture::start();
    fs::write(s.path("한글 파일.txt"), b"x").unwrap();
    assert_eq!(s.connect().list("/").unwrap()[0].name, "한글 파일.txt");
}

#[test]
fn 없는_폴더의_목록은_찾을_수_없음이다() {
    let s = Fixture::start();
    assert!(matches!(
        s.connect().list("/nope").unwrap_err(),
        RemoteError::NotFound(_)
    ));
}

#[test]
fn stat은_파일_폴더_루트를_구분하고_없으면_찾을_수_없음이다() {
    let s = Fixture::start();
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
    let s = Fixture::start();
    let c = s.connect();
    c.mkdir_all("/a/b/c").unwrap();
    assert!(s.path("a/b/c").is_dir());
    c.mkdir_all("/a/b/c").unwrap();
}

#[test]
fn 같은_이름의_파일이_있으면_폴더_만들기는_실패한다() {
    let s = Fixture::start();
    fs::write(s.path("file"), b"x").unwrap();
    assert!(s.connect().mkdir_all("/file/sub").is_err());
}

#[test]
fn 빈_파일을_만들고_다시_만들면_이미_존재함이다() {
    let s = Fixture::start();
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
    let s = Fixture::start();
    fs::write(s.path("old.txt"), b"data").unwrap();
    s.connect().rename("/old.txt", "/new.txt").unwrap();
    assert!(!s.path("old.txt").exists());
    assert_eq!(fs::read(s.path("new.txt")).unwrap(), b"data");
}

#[test]
fn 파일을_지우고_없는_파일은_찾을_수_없음이다() {
    let s = Fixture::start();
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
    let s = Fixture::start();
    fs::create_dir_all(s.path("d/e/f")).unwrap();
    fs::write(s.path("d/1.txt"), b"1").unwrap();
    fs::write(s.path("d/e/f/2.txt"), b"2").unwrap();
    s.connect().remove_dir_all("/d").unwrap();
    assert!(!s.path("d").exists());
}

#[test]
fn 업로드한_파일을_다운로드하면_바이트가_같다() {
    let s = Fixture::start();
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
    let s = Fixture::start();
    assert!(matches!(
        s.connect().read("/none").err().unwrap(),
        RemoteError::NotFound(_)
    ));
}

#[test]
fn 없는_폴더에_쓰면_오류다() {
    let s = Fixture::start();
    assert!(s.connect().write("/no/dir/x").is_err());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn 호출_스레드가_이미_tokio_런타임_안이어도_패닉하지_않는다() {
    let s = Fixture::start();
    fs::write(s.path("a"), b"1").unwrap();
    let list = SftpSession::connect(s.cfg(USER, PASS))
        .unwrap()
        .list("/")
        .unwrap();
    assert_eq!(list.len(), 1);
}

fn attempts(s: &Fixture) -> usize {
    s.auth_attempts.load(std::sync::atomic::Ordering::SeqCst)
}

#[test]
fn 미승인_최초키와_취소는_인증하지_않고_승인후_재연결은_저장키를_쓴다() {
    let s = Fixture::start();
    let mut cfg = s.cfg(USER, PASS);
    cfg.host_key.approved_key = None;
    for _ in 0..2 {
        let err = SftpSession::connect(cfg.clone()).err().unwrap();
        let RemoteError::HostKey(k) = err else {
            panic!("키 확인 필요")
        };
        assert_eq!(k.host, "127.0.0.1");
        assert_eq!(k.port, s.port);
        assert_eq!(k.algorithm, "ssh-ed25519");
        assert!(k.fingerprint.starts_with("SHA256:"));
        assert_eq!(k.previous_fingerprint, None);
        assert_eq!(k.public_key, s.public_key);
    }
    assert_eq!(attempts(&s), 0);
    assert_eq!(
        SftpSession::connect(s.cfg(USER, PASS))
            .unwrap()
            .home()
            .unwrap(),
        "/"
    );
    assert_eq!(attempts(&s), 1);
    assert_eq!(SftpSession::connect(cfg).unwrap().home().unwrap(), "/");
    assert_eq!(attempts(&s), 2);
}

#[test]
fn 변경키는_승인값이_있어도_차단하고_기존키를_보존한다() {
    let s = Fixture::start();
    let other = Fixture::start();
    let cfg = s.cfg(USER, PASS);
    let dir = cfg.host_key.directory.as_ref().unwrap();
    fs::create_dir_all(dir).unwrap();
    let path = dir.join(format!("3132372e302e302e31-{}.pub", s.port));
    fs::write(&path, &other.public_key).unwrap();
    let RemoteError::HostKey(k) = SftpSession::connect(cfg).err().unwrap() else {
        panic!("변경키 차단")
    };
    assert!(k.previous_fingerprint.is_some());
    assert_ne!(k.previous_fingerprint.unwrap(), k.fingerprint);
    assert_eq!(fs::read_to_string(path).unwrap(), other.public_key);
    assert_eq!(attempts(&s), 0);
}

#[test]
fn 저장실패와_다른키_승인은_인증하지_않는다() {
    let s = Fixture::start();
    let mut cfg = s.cfg(USER, PASS);
    let file = tempfile::NamedTempFile::new().unwrap();
    cfg.host_key.directory = Some(file.path().into());
    assert!(SftpSession::connect(cfg).is_err());
    let mut cfg = s.cfg(USER, PASS);
    cfg.host_key.approved_key = Some(Fixture::start().public_key.clone());
    assert!(matches!(
        SftpSession::connect(cfg),
        Err(RemoteError::HostKey(_))
    ));
    assert_eq!(attempts(&s), 0);
}

#[test]
fn 동시_승인_연결은_같은키만_저장한다() {
    let s = Fixture::start();
    std::thread::scope(|scope| {
        let a = scope.spawn(|| SftpSession::connect(s.cfg(USER, PASS)));
        let b = scope.spawn(|| SftpSession::connect(s.cfg(USER, PASS)));
        assert!(a.join().unwrap().is_ok());
        assert!(b.join().unwrap().is_ok());
    });
    assert_eq!(attempts(&s), 2);
}

#[test]
fn 저장된_비밀번호도_미승인키_검증을_우회하지_않는다() {
    struct FakeSecrets;
    impl td_remote::SecretStore for FakeSecrets {
        fn get(&self, _: &str) -> td_remote::Result<Option<String>> {
            Ok(Some(PASS.into()))
        }
        fn set(&self, _: &str, _: &str) -> td_remote::Result<()> {
            panic!("미인증 자격증명 저장 금지")
        }
        fn delete(&self, _: &str) -> td_remote::Result<()> {
            panic!("자격증명 삭제 금지")
        }
    }
    let s = Fixture::start();
    let target = td_remote::RemoteTarget {
        protocol: td_remote::Protocol::Sftp,
        host: "127.0.0.1".into(),
        port: s.port,
        user: USER.into(),
        base_dir: "".into(),
    };
    let mut policy = s.cfg(USER, PASS).host_key;
    policy.approved_key = None;
    let opener = |target: &td_remote::RemoteTarget, user: &str, password: &str| {
        td_remote::connect_session_verified(target, user, password, policy.clone())
    };
    assert!(matches!(
        td_remote::open_session(&target, None, true, &FakeSecrets, &opener),
        Err(RemoteError::HostKey(_))
    ));
    assert_eq!(attempts(&s), 0);
}

#[test]
fn 서버가_내려가면_재연결이_필요해서_is_alive가_거짓이_된다() {
    let s = Fixture::start();
    let session = SftpSession::connect(s.cfg(USER, PASS)).unwrap();
    assert!(session.is_alive());
    assert!(session.home().is_ok());
    drop(s);
    // 연결 작업이 끝났다는 것을 알아채는 데 잠깐 걸린다.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while session.is_alive() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert!(
        !session.is_alive(),
        "서버를 내렸는데 5초 안에 끊김을 알지 못했다"
    );
    assert!(session.home().is_err());
}

/// `deadline` 안에 연결이 끊겼다고 알아채면 참.
fn dies_within(session: &SftpSession, deadline: std::time::Duration) -> bool {
    let end = std::time::Instant::now() + deadline;
    while session.is_alive() && std::time::Instant::now() < end {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    !session.is_alive()
}

// 이슈 #108: 무활동 제한이 2초인 서버에 4초 동안 아무것도 하지 않아도 keepalive가 연결을 살려 둔다.
#[test]
fn keepalive가_있으면_무활동_제한이_있는_서버에서도_연결이_유지된다() {
    let s = Fixture::start_with_inactivity(Some(std::time::Duration::from_secs(2)));
    let mut cfg = s.cfg(USER, PASS);
    cfg.keepalive = Some(std::time::Duration::from_millis(500));
    let session = SftpSession::connect(cfg).unwrap();
    std::thread::sleep(std::time::Duration::from_secs(4));
    assert!(
        session.is_alive(),
        "keepalive를 보냈는데 서버가 연결을 끊었다"
    );
    assert!(session.list("/").is_ok());
}

// 위 시험의 대조: 같은 서버에 keepalive 없이 두면 서버가 끊는다(위 시험이 서버가 원래 안 끊어서 통과한 게 아님을 보인다).
#[test]
fn keepalive가_없으면_무활동_제한이_있는_서버가_연결을_끊는다() {
    let s = Fixture::start_with_inactivity(Some(std::time::Duration::from_secs(2)));
    let mut cfg = s.cfg(USER, PASS);
    cfg.keepalive = None;
    let session = SftpSession::connect(cfg).unwrap();
    assert!(
        dies_within(&session, std::time::Duration::from_secs(6)),
        "keepalive가 없는데 무활동 제한이 지나도 연결이 살아 있다"
    );
    assert!(session.list("/").is_err());
}

/// 클라이언트와 서버 사이의 TCP 중계. `freeze`하면 소켓은 열어 둔 채 오가는 바이트를 버린다(NAT가 조용히 연결을 잊은 상태).
struct Blackhole {
    port: u16,
    frozen: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl Blackhole {
    fn start(server_port: u16) -> Self {
        use std::sync::atomic::Ordering;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let frozen = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = frozen.clone();
        std::thread::spawn(move || {
            let Ok((client, _)) = listener.accept() else {
                return;
            };
            let server = std::net::TcpStream::connect(("127.0.0.1", server_port)).unwrap();
            let pipe =
                |mut from: std::net::TcpStream,
                 mut to: std::net::TcpStream,
                 flag: std::sync::Arc<std::sync::atomic::AtomicBool>| {
                    std::thread::spawn(move || {
                        let mut buf = [0u8; 16384];
                        loop {
                            match from.read(&mut buf) {
                                Ok(0) | Err(_) => break,
                                Ok(n) if !flag.load(Ordering::SeqCst) => {
                                    if to.write_all(&buf[..n]).is_err() {
                                        break;
                                    }
                                }
                                Ok(_) => {} // 얼어 있으면 버린다
                            }
                        }
                        // 소켓은 닫지 않는다: 끊김을 알리는 FIN도 가지 않아야 조용한 끊김이다.
                        std::mem::forget(to);
                    });
                };
            pipe(
                client.try_clone().unwrap(),
                server.try_clone().unwrap(),
                flag.clone(),
            );
            pipe(server, client, flag);
        });
        Self { port, frozen }
    }

    fn freeze(&self) {
        self.frozen.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

// 이슈 #108: 중간에서 패킷이 사라지면(FIN 없이 조용히 끊김) keepalive 응답이 없어 몇 초 안에 끊김을 알아챈다.
// 그래야 "다시 연결" 버튼과 자동 재연결이 동작한다.
#[test]
fn blackhole_조용히_끊긴_연결을_keepalive로_감지해_is_alive가_거짓이_된다() {
    let s = Fixture::start();
    let proxy = Blackhole::start(s.port);
    let mut cfg = s.cfg(USER, PASS);
    cfg.port = proxy.port;
    cfg.keepalive = Some(std::time::Duration::from_millis(300));
    let session = SftpSession::connect(cfg).unwrap();
    assert!(session.list("/").is_ok());
    proxy.freeze();
    assert!(
        dies_within(&session, std::time::Duration::from_secs(5)),
        "패킷이 사라졌는데 5초 안에 끊김을 알지 못했다"
    );
}
