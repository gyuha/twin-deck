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
