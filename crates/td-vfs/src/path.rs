use std::fmt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// VFS 안의 위치. 로컬 파일시스템에서는 OS 경로와 같다.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct VfsPath(PathBuf);

impl VfsPath {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self(path.into())
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }

    pub fn join(&self, name: &str) -> Self {
        // 원격 경로(`sftp://id/..`)는 OS와 무관하게 `/`다.
        let remote = self.0.to_string_lossy();
        if crate::remote::is_remote(&remote) {
            let sep = if remote.ends_with('/') { "" } else { "/" };
            return Self(PathBuf::from(format!("{remote}{sep}{name}")));
        }
        // 아카이브 경계(`x.zip!`) 뒤는 OS와 무관하게 `/`다. Windows의 `PathBuf::join`은 `\`를 쓴다.
        if cfg!(windows) {
            let s = self.0.to_string_lossy();
            if s.ends_with('!') || s.contains("!/") {
                let sep = if s.ends_with('/') { "" } else { "/" };
                return Self(PathBuf::from(format!("{s}{sep}{name}")));
            }
        }
        Self(self.0.join(name))
    }

    pub fn parent(&self) -> Option<Self> {
        // 원격 경로는 루트가 끝이다(`sftp:` 같은 조각을 돌려주지 않는다).
        if let Some(loc) = crate::remote::split_remote(&self.0.to_string_lossy()) {
            if loc.path == "/" {
                return None;
            }
            let cut = loc.path.rfind('/').unwrap_or(0);
            let parent = if cut == 0 { "/" } else { &loc.path[..cut] };
            return Some(Self(PathBuf::from(crate::remote::remote_url(
                loc.proto, &loc.id, parent,
            ))));
        }
        self.0.parent().map(|p| Self(p.to_path_buf()))
    }

    pub fn file_name(&self) -> Option<String> {
        self.0.file_name().map(|n| n.to_string_lossy().into_owned())
    }
}

impl fmt::Display for VfsPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.display())
    }
}

impl From<&Path> for VfsPath {
    fn from(p: &Path) -> Self {
        Self(p.to_path_buf())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::VfsPath;

    #[test]
    fn 아카이브_경계_뒤는_슬래시로_잇는다() {
        assert_eq!(
            VfsPath::new("C:\\a\\x.zip!").join("d").to_string(),
            "C:\\a\\x.zip!/d"
        );
        assert_eq!(
            VfsPath::new("C:\\a\\x.zip!/d").join("e").to_string(),
            "C:\\a\\x.zip!/d/e"
        );
        assert_eq!(VfsPath::new("C:\\a").join("b").to_string(), "C:\\a\\b");
    }
}
