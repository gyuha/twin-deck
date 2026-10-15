//! SMB 비밀번호 저장소. 비밀번호는 설정 파일이 아니라 OS 키체인에 둔다(ADR-0018).

use unicode_normalization::UnicodeNormalization;

use crate::{SmbError, SmbTarget};

/// 키체인 서비스 이름.
pub const SECRET_SERVICE: &str = "dev.twindeck.app.smb";

/// 비밀번호 저장소. `get`은 저장된 값이 없으면 `Ok(None)`.
pub trait SecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, SmbError>;
    fn set(&self, key: &str, password: &str) -> Result<(), SmbError>;
    /// 저장된 값이 없어도 성공으로 본다.
    fn delete(&self, key: &str) -> Result<(), SmbError>;
}

/// 키체인 계정 키 `user@host/share`(사용자가 없으면 `host/share`). 모두 NFC로 맞춘다.
pub fn secret_key(target: &SmbTarget) -> String {
    let key = match target.user() {
        Some(user) => format!("{user}@{}/{}", target.host, target.share),
        None => format!("{}/{}", target.host, target.share),
    };
    key.nfc().collect()
}

/// OS 키체인(macOS 키체인, Windows 자격 증명 관리자). 그 밖의 OS에서는 저장된 값이 없는 것으로
/// 동작하고 저장은 `Unsupported`로 실패한다.
#[derive(Debug, Default, Clone, Copy)]
pub struct KeyringStore;

#[cfg(any(target_os = "macos", windows))]
mod native {
    use super::*;

    fn entry(key: &str) -> Result<keyring::Entry, SmbError> {
        keyring::Entry::new(SECRET_SERVICE, key).map_err(|e| SmbError::Other(e.to_string()))
    }

    impl SecretStore for KeyringStore {
        fn get(&self, key: &str) -> Result<Option<String>, SmbError> {
            match entry(key)?.get_password() {
                Ok(pw) => Ok(Some(pw)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => Err(SmbError::Other(e.to_string())),
            }
        }

        fn set(&self, key: &str, password: &str) -> Result<(), SmbError> {
            entry(key)?
                .set_password(password)
                .map_err(|e| SmbError::Other(e.to_string()))
        }

        fn delete(&self, key: &str) -> Result<(), SmbError> {
            match entry(key)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(SmbError::Other(e.to_string())),
            }
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
impl SecretStore for KeyringStore {
    fn get(&self, _: &str) -> Result<Option<String>, SmbError> {
        Ok(None)
    }

    fn set(&self, _: &str, _: &str) -> Result<(), SmbError> {
        Err(SmbError::Unsupported)
    }

    fn delete(&self, _: &str) -> Result<(), SmbError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(user: Option<&str>, share: &str) -> SmbTarget {
        SmbTarget {
            host: "nas.local".into(),
            share: share.into(),
            user: user.map(Into::into),
        }
    }

    #[test]
    fn 키는_사용자_골뱅이_호스트_슬래시_공유() {
        assert_eq!(secret_key(&t(Some("kim"), "media")), "kim@nas.local/media");
        assert_eq!(
            secret_key(&t(Some("CORP;kim"), "My Share")),
            "CORP;kim@nas.local/My Share"
        );
    }

    #[test]
    fn 사용자가_없으면_호스트_슬래시_공유() {
        assert_eq!(secret_key(&t(None, "media")), "nas.local/media");
        assert_eq!(secret_key(&t(Some(""), "media")), "nas.local/media");
    }

    #[test]
    fn 키는_nfc로_맞춘다() {
        let nfd: String = "사진".nfd().collect();
        assert_eq!(secret_key(&t(Some("kim"), &nfd)), "kim@nas.local/사진");
    }
}
