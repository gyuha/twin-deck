//! 서버 항목으로 세션을 여는 순서: 비밀번호 정하기 → 접속 → 성공하면 키체인에 저장.

use std::sync::Arc;

use crate::{
    secret_key, FtpConfig, FtpSession, RemoteError, RemoteSession, Result, SecretStore, SftpConfig,
    SftpSession,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protocol {
    Sftp,
    Ftp,
}

impl Protocol {
    pub fn name(self) -> &'static str {
        match self {
            Protocol::Sftp => "sftp",
            Protocol::Ftp => "ftp",
        }
    }
}

/// 연결할 서버. 설정(td-config)에 의존하지 않고 자체 타입을 쓴다. 앱이 서버 항목을 여기로 옮긴다.
/// `user`가 비면 FTP는 `anonymous`로 연결하고 SFTP는 인증 오류다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteTarget {
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub base_dir: String,
}

impl RemoteTarget {
    /// 열린 세션을 찾는 열쇠이자 경로(`sftp://<id>/..`)의 연결 id. `user@host:port`(사용자가 없으면 `host:port`)다.
    /// 서버 항목의 표시 이름이나 목록 순서가 바뀌어도 같은 서버면 같은 id라서 탭에 저장된 경로가 그대로 유효하다.
    pub fn id(&self) -> String {
        if self.user.is_empty() {
            format!("{}:{}", self.host, self.port)
        } else {
            format!("{}@{}:{}", self.user, self.host, self.port)
        }
    }
}

/// 실제 접속을 하는 함수(테스트에서는 가짜로 바꾼다). 인자는 대상, 사용자, 비밀번호.
pub type SessionOpener<'a> =
    &'a dyn Fn(&RemoteTarget, &str, &str) -> Result<Arc<dyn RemoteSession>>;

/// 대상 서버에 실제로 접속한다. SFTP는 명시적 신뢰 정책이 없으므로 거부한다.
/// 앱에서는 `connect_session_verified`에 로컬 저장소와 사용자가 승인한 공개 키를 넘긴다.
pub fn connect_session(
    target: &RemoteTarget,
    user: &str,
    password: &str,
) -> Result<Arc<dyn RemoteSession>> {
    connect_session_verified(target, user, password, Default::default())
}

/// 앱 전용 호스트 키 정책을 적용하는 연결 경로.
pub fn connect_session_verified(
    target: &RemoteTarget,
    user: &str,
    password: &str,
    host_key: crate::HostKeyPolicy,
) -> Result<Arc<dyn RemoteSession>> {
    match target.protocol {
        Protocol::Sftp => Ok(Arc::new(SftpSession::connect(SftpConfig {
            host: target.host.clone(),
            port: target.port,
            user: user.into(),
            password: password.into(),
            keepalive: Some(crate::KEEPALIVE_INTERVAL),
            host_key,
        })?)),
        Protocol::Ftp => Ok(Arc::new(FtpSession::connect(FtpConfig {
            host: target.host.clone(),
            port: target.port,
            user: user.into(),
            password: password.into(),
        })?)),
    }
}

/// 세션을 열고, 접속 직후 이동할 폴더(`base_dir`, 비면 서버가 알려 주는 홈)를 함께 돌려준다. 블로킹이다.
///
/// 순서: 사용자가 없으면 FTP는 익명 → `password`가 없으면 키체인 값 → 사용자가 있는데 비밀번호가 없으면 `Auth`
/// → 접속(`Auth`여도 저장된 값은 지우지 않는다) → 성공했고 `remember`이며 인자로 받은 비밀번호면 키체인에 저장.
pub fn open_session<S: SecretStore>(
    target: &RemoteTarget,
    password: Option<String>,
    remember: bool,
    secrets: &S,
    opener: SessionOpener<'_>,
) -> Result<(Arc<dyn RemoteSession>, String)> {
    let session = if target.user.is_empty() {
        if target.protocol == Protocol::Sftp {
            return Err(RemoteError::Auth);
        }
        opener(target, "anonymous", "anonymous@")?
    } else {
        let given = password.filter(|p| !p.is_empty());
        let key = secret_key(target);
        let used = match &given {
            Some(p) => p.clone(),
            None => secrets.get(&key)?.ok_or(RemoteError::Auth)?,
        };
        let session = opener(target, &target.user, &used)?;
        if remember {
            if let Some(p) = &given {
                secrets.set(&key, p)?;
            }
        }
        session
    };
    let root = if target.base_dir.trim().is_empty() {
        session.home()?
    } else {
        target.base_dir.trim().to_string()
    };
    Ok((session, root))
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::HashMap;

    use super::*;
    use crate::{RemoteEntry, RemoteWrite};

    #[derive(Default)]
    struct Mem(RefCell<HashMap<String, String>>);
    impl SecretStore for Mem {
        fn get(&self, k: &str) -> Result<Option<String>> {
            Ok(self.0.borrow().get(k).cloned())
        }
        fn set(&self, k: &str, p: &str) -> Result<()> {
            self.0.borrow_mut().insert(k.into(), p.into());
            Ok(())
        }
        fn delete(&self, k: &str) -> Result<()> {
            self.0.borrow_mut().remove(k);
            Ok(())
        }
    }

    struct Home(String);
    impl RemoteSession for Home {
        fn home(&self) -> Result<String> {
            Ok(self.0.clone())
        }
        fn list(&self, _: &str) -> Result<Vec<RemoteEntry>> {
            unimplemented!()
        }
        fn stat(&self, _: &str) -> Result<RemoteEntry> {
            unimplemented!()
        }
        fn mkdir_all(&self, _: &str) -> Result<()> {
            unimplemented!()
        }
        fn create_empty(&self, _: &str) -> Result<()> {
            unimplemented!()
        }
        fn rename(&self, _: &str, _: &str) -> Result<()> {
            unimplemented!()
        }
        fn remove_file(&self, _: &str) -> Result<()> {
            unimplemented!()
        }
        fn remove_dir_all(&self, _: &str) -> Result<()> {
            unimplemented!()
        }
        fn read(&self, _: &str) -> Result<Box<dyn std::io::Read + Send>> {
            unimplemented!()
        }
        fn write(&self, _: &str) -> Result<Box<dyn RemoteWrite>> {
            unimplemented!()
        }
    }

    fn target(protocol: Protocol, user: &str, base: &str) -> RemoteTarget {
        RemoteTarget {
            protocol,
            host: "h".into(),
            port: 22,
            user: user.into(),
            base_dir: base.into(),
        }
    }

    /// 비밀번호가 `good`일 때만 열리는 가짜 접속. 받은 (사용자, 비밀번호)를 기록한다.
    fn opener(
        calls: &RefCell<Vec<(String, String)>>,
    ) -> impl Fn(&RemoteTarget, &str, &str) -> Result<Arc<dyn RemoteSession>> + '_ {
        move |_, user, pw| {
            calls.borrow_mut().push((user.into(), pw.into()));
            if pw == "good" || user == "anonymous" {
                Ok(Arc::new(Home("/home/me".into())))
            } else {
                Err(RemoteError::Auth)
            }
        }
    }

    #[test]
    fn 연결_id는_사용자_호스트_포트이고_슬래시를_담지_않는다() {
        assert_eq!(target(Protocol::Sftp, "me", "").id(), "me@h:22");
        assert_eq!(target(Protocol::Ftp, "", "").id(), "h:22");
    }

    #[test]
    fn 비밀번호가_없고_키체인에도_없으면_인증_오류다() {
        let calls = RefCell::new(vec![]);
        let err = open_session(
            &target(Protocol::Sftp, "me", ""),
            None,
            false,
            &Mem::default(),
            &opener(&calls),
        )
        .err()
        .unwrap();
        assert_eq!(err, RemoteError::Auth);
        assert!(
            calls.borrow().is_empty(),
            "비밀번호 없이 접속을 시도하면 안 된다"
        );
    }

    #[test]
    fn 키체인_비밀번호로_접속한다() {
        let calls = RefCell::new(vec![]);
        let store = Mem::default();
        store.set("me@h:22/sftp", "good").unwrap();
        let (_, root) = open_session(
            &target(Protocol::Sftp, "me", ""),
            None,
            false,
            &store,
            &opener(&calls),
        )
        .unwrap();
        assert_eq!(root, "/home/me");
        assert_eq!(calls.borrow()[0], ("me".to_string(), "good".to_string()));
    }

    #[test]
    fn 틀린_비밀번호는_인증_오류이고_저장된_값은_지우지_않는다() {
        let calls = RefCell::new(vec![]);
        let store = Mem::default();
        store.set("me@h:22/sftp", "good").unwrap();
        let err = open_session(
            &target(Protocol::Sftp, "me", ""),
            Some("bad".into()),
            true,
            &store,
            &opener(&calls),
        )
        .err()
        .unwrap();
        assert_eq!(err, RemoteError::Auth);
        assert_eq!(store.get("me@h:22/sftp").unwrap().as_deref(), Some("good"));
    }

    #[test]
    fn 성공하고_기억하면_받은_비밀번호를_키체인에_저장한다() {
        let calls = RefCell::new(vec![]);
        let store = Mem::default();
        open_session(
            &target(Protocol::Ftp, "me", ""),
            Some("good".into()),
            true,
            &store,
            &opener(&calls),
        )
        .unwrap();
        assert_eq!(store.get("me@h:22/ftp").unwrap().as_deref(), Some("good"));
    }

    #[test]
    fn 기억하지_않으면_저장하지_않는다() {
        let calls = RefCell::new(vec![]);
        let store = Mem::default();
        open_session(
            &target(Protocol::Ftp, "me", ""),
            Some("good".into()),
            false,
            &store,
            &opener(&calls),
        )
        .unwrap();
        assert_eq!(store.get("me@h:22/ftp").unwrap(), None);
    }

    #[test]
    fn 시작_폴더가_있으면_홈_대신_쓴다() {
        let calls = RefCell::new(vec![]);
        let (_, root) = open_session(
            &target(Protocol::Sftp, "me", " /srv/data "),
            Some("good".into()),
            false,
            &Mem::default(),
            &opener(&calls),
        )
        .unwrap();
        assert_eq!(root, "/srv/data");
    }

    #[test]
    fn 사용자가_없는_ftp는_익명으로_접속한다() {
        let calls = RefCell::new(vec![]);
        let (_, root) = open_session(
            &target(Protocol::Ftp, "", ""),
            None,
            true,
            &Mem::default(),
            &opener(&calls),
        )
        .unwrap();
        assert_eq!(root, "/home/me");
        assert_eq!(calls.borrow()[0].0, "anonymous");
    }

    #[test]
    fn 사용자가_없는_sftp는_인증_오류다() {
        let calls = RefCell::new(vec![]);
        let err = open_session(
            &target(Protocol::Sftp, "", ""),
            None,
            false,
            &Mem::default(),
            &opener(&calls),
        )
        .err()
        .unwrap();
        assert_eq!(err, RemoteError::Auth);
    }

    #[test]
    fn 빈_비밀번호는_없는_것으로_본다() {
        let calls = RefCell::new(vec![]);
        let err = open_session(
            &target(Protocol::Sftp, "me", ""),
            Some(String::new()),
            true,
            &Mem::default(),
            &opener(&calls),
        )
        .err()
        .unwrap();
        assert_eq!(err, RemoteError::Auth);
    }
}
