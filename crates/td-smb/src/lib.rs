//! SMB 공유를 OS에 마운트한다(ADR-0018). 자체 SMB 클라이언트는 없다.
//! 마운트한 뒤에는 로컬 경로라서 기존 파일 작업이 그대로 쓰인다.
//! 설정(td-config)에 의존하지 않고 자체 `SmbTarget`을 쓴다. 앱이 서버 항목을 여기로 옮긴다.

mod find;
mod mount;
mod secret;
mod url;

use std::path::PathBuf;

pub use find::{find_mounted, mntfrom_matches, unc_matches};
pub use mount::{Mounter, SystemMounter};
pub use secret::{secret_key, KeyringStore, SecretStore, SECRET_SERVICE};
pub use url::{smb_url, unc_path};

/// 연결할 SMB 공유. `user`가 `None`(또는 빈 문자열)이면 게스트로 연결한다.
/// `user`에는 `DOMAIN;user`, `host`에는 `host:port`를 쓸 수 있다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmbTarget {
    pub host: String,
    pub share: String,
    pub user: Option<String>,
}

impl SmbTarget {
    /// 비어 있지 않은 사용자 이름.
    pub fn user(&self) -> Option<&str> {
        self.user.as_deref().filter(|u| !u.is_empty())
    }
}

#[derive(Debug, Clone, thiserror::Error, PartialEq, Eq)]
pub enum SmbError {
    /// 비밀번호가 없거나 틀렸다. UI는 비밀번호를 물어야 한다.
    #[error("인증에 실패했습니다. 사용자 이름과 비밀번호를 확인하세요")]
    Auth,
    #[error("서버나 공유에 연결할 수 없습니다")]
    Unreachable,
    #[error("이 운영체제에서는 SMB 연결을 지원하지 않습니다")]
    Unsupported,
    #[error("SMB 연결에 실패했습니다: {0}")]
    Other(String),
}

/// 공유에 연결하고 마운트 지점을 돌려준다. 블로킹 함수다(마운트가 끝날 때까지 기다린다).
///
/// 순서: 이미 마운트돼 있으면 그 경로 → `password`가 없으면 키체인 값 →
/// 사용자가 있는데 비밀번호가 없으면 `Auth` → 마운트(`Auth`여도 저장된 값은 지우지 않는다) →
/// 성공했고 `remember`이며 인자로 받은 비밀번호면 키체인에 저장.
pub fn connect<M: Mounter, S: SecretStore>(
    target: &SmbTarget,
    password: Option<String>,
    remember: bool,
    mounter: &M,
    secrets: &S,
    find: impl Fn(&SmbTarget) -> Option<PathBuf>,
) -> Result<PathBuf, SmbError> {
    if let Some(path) = find(target) {
        return Ok(path);
    }
    let key = secret_key(target);
    let from_arg = password.is_some();
    // 키체인을 못 읽으면 저장된 값이 없는 것으로 보고 비밀번호를 묻게 한다.
    let password = password.or_else(|| secrets.get(&key).ok().flatten());
    if target.user().is_some() && password.is_none() {
        return Err(SmbError::Auth);
    }
    let path = mounter.mount(target, password.as_deref())?;
    if remember && from_arg && target.user().is_some() {
        if let Some(pw) = &password {
            // 마운트는 이미 됐으므로 저장 실패로 연결을 실패시키지 않는다. 다음에 다시 묻게 될 뿐이다.
            let _ = secrets.set(&key, pw);
        }
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;

    struct FakeMounter {
        result: Result<PathBuf, SmbError>,
        calls: RefCell<Vec<Option<String>>>,
    }

    impl FakeMounter {
        fn new(result: Result<PathBuf, SmbError>) -> Self {
            Self {
                result,
                calls: RefCell::new(Vec::new()),
            }
        }
    }

    impl Mounter for FakeMounter {
        fn mount(&self, _: &SmbTarget, password: Option<&str>) -> Result<PathBuf, SmbError> {
            self.calls.borrow_mut().push(password.map(str::to_owned));
            self.result.clone()
        }
    }

    #[derive(Default)]
    struct FakeSecrets(RefCell<HashMap<String, String>>);

    impl SecretStore for FakeSecrets {
        fn get(&self, key: &str) -> Result<Option<String>, SmbError> {
            Ok(self.0.borrow().get(key).cloned())
        }
        fn set(&self, key: &str, password: &str) -> Result<(), SmbError> {
            self.0.borrow_mut().insert(key.into(), password.into());
            Ok(())
        }
        fn delete(&self, key: &str) -> Result<(), SmbError> {
            self.0.borrow_mut().remove(key);
            Ok(())
        }
    }

    fn target(user: Option<&str>) -> SmbTarget {
        SmbTarget {
            host: "nas".into(),
            share: "공유".into(),
            user: user.map(Into::into),
        }
    }

    fn mounted() -> Result<PathBuf, SmbError> {
        Ok(PathBuf::from("/Volumes/공유"))
    }

    fn not_found(_: &SmbTarget) -> Option<PathBuf> {
        None
    }

    #[test]
    fn 이미_마운트돼_있으면_마운트하지_않고_그_경로를_돌려준다() {
        let m = FakeMounter::new(Err(SmbError::Unreachable));
        let s = FakeSecrets::default();
        let r = connect(&target(Some("kim")), None, false, &m, &s, |_| {
            Some(PathBuf::from("/Volumes/x"))
        });
        assert_eq!(r, Ok(PathBuf::from("/Volumes/x")));
        assert!(m.calls.borrow().is_empty());
    }

    #[test]
    fn 비밀번호_인자가_없으면_키체인_값으로_마운트한다() {
        let m = FakeMounter::new(mounted());
        let s = FakeSecrets::default();
        let t = target(Some("kim"));
        s.set(&secret_key(&t), "saved").unwrap();
        assert!(connect(&t, None, false, &m, &s, not_found).is_ok());
        assert_eq!(*m.calls.borrow(), vec![Some("saved".to_string())]);
    }

    #[test]
    fn 사용자가_있는데_비밀번호가_없으면_마운트하지_않고_인증_오류() {
        let m = FakeMounter::new(mounted());
        let s = FakeSecrets::default();
        let r = connect(&target(Some("kim")), None, true, &m, &s, not_found);
        assert_eq!(r, Err(SmbError::Auth));
        assert!(m.calls.borrow().is_empty());
    }

    #[test]
    fn 사용자가_없으면_비밀번호_없이_게스트로_마운트한다() {
        let m = FakeMounter::new(mounted());
        let s = FakeSecrets::default();
        assert!(connect(&target(None), None, true, &m, &s, not_found).is_ok());
        assert!(connect(&target(Some("")), None, true, &m, &s, not_found).is_ok());
        assert_eq!(*m.calls.borrow(), vec![None, None]);
        assert!(s.0.borrow().is_empty());
    }

    #[test]
    fn 인증에_실패해도_저장된_비밀번호를_지우지_않는다() {
        let m = FakeMounter::new(Err(SmbError::Auth));
        let s = FakeSecrets::default();
        let t = target(Some("kim"));
        s.set(&secret_key(&t), "saved").unwrap();
        assert_eq!(
            connect(&t, None, true, &m, &s, not_found),
            Err(SmbError::Auth)
        );
        assert_eq!(
            connect(&t, Some("new".into()), true, &m, &s, not_found),
            Err(SmbError::Auth)
        );
        assert_eq!(s.get(&secret_key(&t)).unwrap().as_deref(), Some("saved"));
    }

    #[test]
    fn 성공하고_기억하기면_인자로_받은_비밀번호를_저장한다() {
        let m = FakeMounter::new(mounted());
        let s = FakeSecrets::default();
        let t = target(Some("kim"));
        let r = connect(&t, Some("pw".into()), true, &m, &s, not_found);
        assert_eq!(r, mounted());
        assert_eq!(s.get(&secret_key(&t)).unwrap().as_deref(), Some("pw"));
    }

    #[test]
    fn 기억하기가_아니면_저장하지_않는다() {
        let m = FakeMounter::new(mounted());
        let s = FakeSecrets::default();
        assert!(connect(
            &target(Some("kim")),
            Some("pw".into()),
            false,
            &m,
            &s,
            not_found
        )
        .is_ok());
        assert!(s.0.borrow().is_empty());
    }

    #[test]
    fn 키체인에서_읽은_비밀번호는_다시_저장하지_않는다() {
        struct NoSet(FakeSecrets);
        impl SecretStore for NoSet {
            fn get(&self, key: &str) -> Result<Option<String>, SmbError> {
                self.0.get(key)
            }
            fn set(&self, _: &str, _: &str) -> Result<(), SmbError> {
                panic!("저장하면 안 된다");
            }
            fn delete(&self, key: &str) -> Result<(), SmbError> {
                self.0.delete(key)
            }
        }
        let m = FakeMounter::new(mounted());
        let t = target(Some("kim"));
        let s = NoSet(FakeSecrets::default());
        s.0.set(&secret_key(&t), "saved").unwrap();
        assert!(connect(&t, None, true, &m, &s, not_found).is_ok());
    }

    #[test]
    fn 연결할_수_없음_오류는_그대로_돌려준다() {
        let m = FakeMounter::new(Err(SmbError::Unreachable));
        let s = FakeSecrets::default();
        let r = connect(
            &target(Some("kim")),
            Some("pw".into()),
            true,
            &m,
            &s,
            not_found,
        );
        assert_eq!(r, Err(SmbError::Unreachable));
        assert!(s.0.borrow().is_empty());
    }
}
