use super::*;
use russh::client;

struct Client;
impl client::Handler for Client {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _k: &russh::keys::PublicKeyOrCertificate,
    ) -> std::result::Result<bool, Self::Error> {
        Ok(true)
    }
}

/// 시험용 접속 설정이 이 서버의 호스트 키를 신뢰하게 한다(처음 보는 키의 승인을 대신한다).
fn trust(dir: &std::path::Path) -> crate::HostKeyPolicy {
    let key = host_key::load_or_create(&dir.join("host_key")).unwrap();
    crate::HostKeyPolicy {
        directory: Some(dir.join("trusted")),
        approved_key: Some(key.public_key().to_openssh().unwrap()),
    }
}

fn cfg(dir: &std::path::Path) -> ServerConfig {
    ServerConfig {
        bind: "127.0.0.1".into(),
        port: 0,
        root: dir.to_path_buf(),
        allow_write: false,
        allow_shell: false,
        user: "me".into(),
        password: "secret".into(),
        host_key_path: dir.join("host_key"),
    }
}

fn login(addr: std::net::SocketAddr, user: &str, pass: &str) -> bool {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        let mut h = client::connect(Arc::new(client::Config::default()), addr, Client)
            .await
            .unwrap();
        h.authenticate_password(user, pass).await.unwrap().success()
    })
}

// 이슈 #108: 서버는 무활동 제한 없이 30초마다 keepalive를 보내고, 3번 답이 없으면 죽은 연결로 정리한다.
#[test]
fn server_keepalive_config_has_no_inactivity_limit() {
    let key =
        russh::keys::PrivateKey::random(&mut rand::rng(), russh::keys::Algorithm::Ed25519).unwrap();
    let c = ssh_config(key, crate::KEEPALIVE_INTERVAL);
    assert_eq!(c.inactivity_timeout, None);
    assert_eq!(c.keepalive_interval, Some(Duration::from_secs(30)));
    assert_eq!(c.keepalive_max, 3);
}

#[test]
fn server_host_key_survives_restart() {
    let dir = tempfile::tempdir().unwrap();
    let a = start(cfg(dir.path())).unwrap();
    assert!(dir.path().join("host_key").exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(dir.path().join("host_key"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
    let fp = a.fingerprint.clone();
    a.stop();
    let b = start(cfg(dir.path())).unwrap();
    assert_eq!(b.fingerprint, fp);
    assert!(fp.starts_with("SHA256:"));
}

#[test]
fn server_port_zero_reports_actual_port() {
    let dir = tempfile::tempdir().unwrap();
    let s = start(cfg(dir.path())).unwrap();
    assert_ne!(s.local_addr.port(), 0);
}

#[test]
fn server_password_auth() {
    let dir = tempfile::tempdir().unwrap();
    let s = start(cfg(dir.path())).unwrap();
    assert!(login(s.local_addr, "me", "secret"));
    assert!(!login(s.local_addr, "me", "wrong"));
    assert!(!login(s.local_addr, "other", "secret"));
}

#[test]
fn server_empty_password_rejects_everyone() {
    let dir = tempfile::tempdir().unwrap();
    let mut c = cfg(dir.path());
    c.password.clear();
    let s = start(c).unwrap();
    assert!(!login(s.local_addr, "me", ""));
}

mod sftp_tests {
    use super::*;
    use crate::{RemoteError, RemoteKind, RemoteSession, SftpConfig, SftpSession};
    use std::io::{Read, Write};

    fn serve(allow_write: bool) -> (tempfile::TempDir, ServerHandle, SftpSession) {
        let dir = tempfile::tempdir().unwrap();
        let share = dir.path().join("share");
        std::fs::create_dir_all(&share).unwrap();
        let mut c = cfg(dir.path());
        c.root = share;
        c.allow_write = allow_write;
        let s = start(c).unwrap();
        let sess = SftpSession::connect(SftpConfig {
            host: "127.0.0.1".into(),
            port: s.local_addr.port(),
            user: "me".into(),
            password: "secret".into(),
            keepalive: Some(crate::KEEPALIVE_INTERVAL),
            host_key: trust(dir.path()),
        })
        .unwrap();
        (dir, s, sess)
    }

    // 이슈 #108: 서버가 보내는 keepalive에 클라이언트가 답하므로, keepalive를 보내지 않는 클라이언트(옛 버전)도 쉬는 동안 끊기지 않는다.
    // 클라이언트가 답하지 못하면 서버가 3번(0.9초) 뒤 죽은 연결로 정리해 이 시험이 실패한다.
    #[test]
    fn server_keepalive_keeps_a_client_without_keepalive_connected() {
        let dir = tempfile::tempdir().unwrap();
        let share = dir.path().join("share");
        std::fs::create_dir_all(&share).unwrap();
        let mut c = cfg(dir.path());
        c.root = share;
        let s = start_with_keepalive(c, std::time::Duration::from_millis(300)).unwrap();
        let sess = SftpSession::connect(SftpConfig {
            host: "127.0.0.1".into(),
            port: s.local_addr.port(),
            user: "me".into(),
            password: "secret".into(),
            keepalive: None,
            host_key: trust(dir.path()),
        })
        .unwrap();
        std::thread::sleep(std::time::Duration::from_secs(2));
        assert!(sess.is_alive());
        assert!(sess.list("/").is_ok());
    }

    #[test]
    fn server_sftp_wrong_password_is_auth_error() {
        let dir = tempfile::tempdir().unwrap();
        let s = start(cfg(dir.path())).unwrap();
        let r = SftpSession::connect(SftpConfig {
            host: "127.0.0.1".into(),
            port: s.local_addr.port(),
            user: "me".into(),
            password: "nope".into(),
            keepalive: Some(crate::KEEPALIVE_INTERVAL),
            host_key: trust(dir.path()),
        });
        assert!(matches!(r, Err(RemoteError::Auth)));
    }

    #[test]
    fn server_sftp_list_read_write_rename_delete() {
        let (dir, _s, sess) = serve(true);
        std::fs::write(dir.path().join("share/a.txt"), "hello").unwrap();
        let names: Vec<_> = sess
            .list("/")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, ["a.txt"]);
        let mut buf = String::new();
        sess.read("/a.txt")
            .unwrap()
            .read_to_string(&mut buf)
            .unwrap();
        assert_eq!(buf, "hello");

        sess.mkdir_all("/d/e").unwrap();
        let mut w = sess.write("/d/e/b.txt").unwrap();
        w.write_all(b"data").unwrap();
        w.finish().unwrap();
        assert_eq!(
            std::fs::read(dir.path().join("share/d/e/b.txt")).unwrap(),
            b"data"
        );
        assert_eq!(sess.stat("/d").unwrap().kind, RemoteKind::Dir);

        sess.rename("/d/e/b.txt", "/d/c.txt").unwrap();
        assert!(dir.path().join("share/d/c.txt").exists());
        sess.remove_file("/d/c.txt").unwrap();
        sess.remove_dir_all("/d").unwrap();
        assert!(!dir.path().join("share/d").exists());
    }

    #[test]
    fn server_jail_blocks_escape() {
        let (dir, _s, sess) = serve(true);
        std::fs::write(dir.path().join("secret.txt"), "top").unwrap();
        // `..`은 루트에서 멈춰 루트 안의 같은 이름을 가리킨다(바깥 파일이 읽히면 안 된다).
        assert!(sess.read("/../secret.txt").is_err());
        assert!(sess.read("../../secret.txt").is_err());
        // 절대경로도 루트 기준이라 바깥 실제 경로는 닿지 않는다.
        let abs = dir.path().join("secret.txt");
        assert!(sess.read(abs.to_str().unwrap()).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(
                dir.path().join("secret.txt"),
                dir.path().join("share/link"),
            )
            .unwrap();
            std::os::unix::fs::symlink(dir.path(), dir.path().join("share/dirlink")).unwrap();
            assert!(sess.read("/link").is_err());
            assert!(sess.list("/dirlink").is_err());
            assert!(
                sess.list("/").unwrap().is_empty(),
                "루트 밖을 가리키는 링크는 목록에서 감춘다"
            );
            assert!(sess.write("/dirlink/new.txt").is_err());
            assert!(!dir.path().join("new.txt").exists());
        }
    }

    #[test]
    fn server_jail_read_only_rejects_writes() {
        let (dir, _s, sess) = serve(false);
        std::fs::write(dir.path().join("share/a.txt"), "hello").unwrap();
        let mut buf = String::new();
        sess.read("/a.txt")
            .unwrap()
            .read_to_string(&mut buf)
            .unwrap();
        assert_eq!(buf, "hello");
        assert!(sess.mkdir_all("/x").is_err());
        assert!(sess.create_empty("/n.txt").is_err());
        assert!(sess.rename("/a.txt", "/b.txt").is_err());
        assert!(sess.remove_file("/a.txt").is_err());
        let w = sess.write("/a.txt");
        assert!(w.is_err() || w.unwrap().finish().is_err());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("share/a.txt")).unwrap(),
            "hello"
        );
        assert!(!dir.path().join("share/x").exists() && !dir.path().join("share/n.txt").exists());
    }
}

#[cfg(unix)]
mod shell_tests {
    use super::*;
    use crate::{RemoteError, SftpConfig, ShellEvent, ShellSession};
    use std::time::{Duration, Instant};

    fn serve(allow_shell: bool) -> (tempfile::TempDir, ServerHandle) {
        let dir = tempfile::tempdir().unwrap();
        let mut c = cfg(dir.path());
        c.allow_shell = allow_shell;
        let s = start(c).unwrap();
        (dir, s)
    }

    fn open(dir: &std::path::Path, s: &ServerHandle, cols: u16, rows: u16) -> Result<ShellSession> {
        ShellSession::open(
            SftpConfig {
                host: "127.0.0.1".into(),
                port: s.local_addr.port(),
                user: "me".into(),
                password: "secret".into(),
                keepalive: Some(crate::KEEPALIVE_INTERVAL),
                host_key: trust(dir),
            },
            cols,
            rows,
        )
    }

    /// 출력에 `needle`이 나올 때까지 모은다.
    fn wait_for(sh: &ShellSession, needle: &str) -> String {
        let mut out = String::new();
        let end = Instant::now() + Duration::from_secs(15);
        while Instant::now() < end {
            if let Ok(ShellEvent::Output(b)) = sh.events.recv_timeout(Duration::from_millis(200)) {
                out.push_str(&String::from_utf8_lossy(&b));
                if out.contains(needle) {
                    return out;
                }
            }
        }
        panic!("'{needle}'이 나오지 않았다: {out:?}");
    }

    #[test]
    fn server_shell_echo_marker() {
        let (dir, s) = serve(true);
        let sh = open(dir.path(), &s, 80, 24).unwrap();
        sh.write(b"echo TD_$((40+2))_MARK\n").unwrap();
        wait_for(&sh, "TD_42_MARK");
        sh.close();
    }

    #[test]
    fn server_shell_denied_when_not_allowed() {
        let (dir, s) = serve(false);
        assert!(matches!(
            open(dir.path(), &s, 80, 24),
            Err(RemoteError::Other(_))
        ));
    }

    #[test]
    fn server_shell_resize_changes_stty_size() {
        let (dir, s) = serve(true);
        let sh = open(dir.path(), &s, 80, 24).unwrap();
        sh.write(b"stty size\n").unwrap();
        wait_for(&sh, "24 80");
        sh.resize(100, 30).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        sh.write(b"stty size\n").unwrap();
        wait_for(&sh, "30 100");
        sh.close();
    }
}
