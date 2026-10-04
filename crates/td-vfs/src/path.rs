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
