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

fn cfg(dir: &std::path::Path) -> ServerConfig {
    ServerConfig {
        bind: "127.0.0.1".into(),
        port: 0,
        root: dir.to_path_buf(),
        allow_write: false,
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
