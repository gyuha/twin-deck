//! 서버 호스트키 생성·저장·로드. 파일이 없으면 만들고, 있으면 읽어 재시작해도 지문이 같게 한다.

use std::path::Path;

use russh::keys::ssh_key::LineEnding;
use russh::keys::{Algorithm, HashAlg, PrivateKey};

use crate::{RemoteError, Result};

fn other(e: impl std::fmt::Display) -> RemoteError {
    RemoteError::Other(e.to_string())
}

/// `path`의 호스트키를 읽는다. 없으면 새 Ed25519 키를 만들어 저장한다(unix에서 0600).
pub fn load_or_create(path: &Path) -> Result<PrivateKey> {
    if path.exists() {
        return PrivateKey::read_openssh_file(path).map_err(other);
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(other)?;
    }
    let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).map_err(other)?;
    key.write_openssh_file(path, LineEnding::LF)
        .map_err(other)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(other)?;
    }
    Ok(key)
}

/// `SHA256:...` 형식의 지문.
pub fn fingerprint(key: &PrivateKey) -> String {
    key.public_key().fingerprint(HashAlg::Sha256).to_string()
}
