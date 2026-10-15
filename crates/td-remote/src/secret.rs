//! 원격 서버 비밀번호 저장소. 비밀번호는 설정 파일이 아니라 OS 키체인에 둔다(ADR-0019).

use unicode_normalization::UnicodeNormalization;

use crate::{RemoteError, RemoteTarget, Result};

/// 키체인 서비스 이름.
pub const SECRET_SERVICE: &str = "dev.twindeck.app.remote";

/// 비밀번호 저장소. `get`은 저장된 값이 없으면 `Ok(None)`.
pub trait SecretStore {
    fn get(&self, key: &str) -> Result<Option<String>>;
    fn set(&self, key: &str, password: &str) -> Result<()>;
    /// 저장된 값이 없어도 성공으로 본다.
    fn delete(&self, key: &str) -> Result<()>;
}

/// 키체인 계정 키 `user@host:port/protocol`(사용자가 없으면 `host:port/protocol`). 모두 NFC로 맞춘다.
pub fn secret_key(target: &RemoteTarget) -> String {
    let key = if target.user.is_empty() {
        format!("{}:{}/{}", target.host, target.port, target.protocol.name())
    } else {
        format!(
            "{}@{}:{}/{}",
            target.user,
            target.host,
            target.port,
            target.protocol.name()
        )
    };
    key.nfc().collect()
}

/// OS 키체인(macOS 키체인, Windows 자격 증명 관리자). 그 밖의 OS에서는 저장된 값이 없는 것으로
/// 동작하고 저장은 오류로 실패한다.
#[derive(Debug, Default, Clone, Copy)]
pub struct KeyringStore;

#[cfg(any(target_os = "macos", windows))]
mod native {
    use super::*;

    fn entry(key: &str) -> Result<keyring::Entry> {
        keyring::Entry::new(SECRET_SERVICE, key).map_err(|e| RemoteError::Other(e.to_string()))
    }

    impl SecretStore for KeyringStore {
        fn get(&self, key: &str) -> Result<Option<String>> {
            match entry(key)?.get_password() {
                Ok(pw) => Ok(Some(pw)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => Err(RemoteError::Other(e.to_string())),
            }
        }

        fn set(&self, key: &str, password: &str) -> Result<()> {
            entry(key)?
                .set_password(password)
                .map_err(|e| RemoteError::Other(e.to_string()))
        }

        fn delete(&self, key: &str) -> Result<()> {
            match entry(key)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(RemoteError::Other(e.to_string())),
            }
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
impl SecretStore for KeyringStore {
    fn get(&self, _: &str) -> Result<Option<String>> {
        Ok(None)
    }

    fn set(&self, _: &str, _: &str) -> Result<()> {
        Err(RemoteError::Other(
            "이 운영체제에서는 비밀번호를 저장할 수 없습니다".into(),
        ))
    }

    fn delete(&self, _: &str) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Protocol;

    fn t(user: &str, host: &str) -> RemoteTarget {
        RemoteTarget {
            protocol: Protocol::Sftp,
            host: host.into(),
            port: 2222,
            user: user.into(),
            base_dir: String::new(),
        }
    }

    #[test]
    fn 키는_사용자_골뱅이_호스트_포트_프로토콜() {
        assert_eq!(
            secret_key(&t("kim", "files.example.com")),
            "kim@files.example.com:2222/sftp"
        );
    }

    #[test]
    fn 사용자가_없으면_호스트_포트_프로토콜() {
        assert_eq!(secret_key(&t("", "h")), "h:2222/sftp");
    }

    #[test]
    fn 키는_nfc로_맞춘다() {
        let nfd: String = "사진".nfd().collect();
        assert_eq!(secret_key(&t(&nfd, "h")), "사진@h:2222/sftp");
    }

    #[test]
    fn 프로토콜이_다르면_키도_다르다() {
        let mut ftp = t("kim", "h");
        ftp.protocol = Protocol::Ftp;
        assert_ne!(secret_key(&ftp), secret_key(&t("kim", "h")));
    }
}
