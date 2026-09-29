use crate::VfsPath;

#[derive(Debug, thiserror::Error)]
pub enum VfsError {
    #[error("찾을 수 없음: {0}")]
    NotFound(VfsPath),
    #[error("이미 존재함: {0}")]
    AlreadyExists(VfsPath),
    #[error("{path}: {source}")]
    Io {
        path: VfsPath,
        #[source]
        source: std::io::Error,
    },
}

pub type Result<T> = std::result::Result<T, VfsError>;

impl VfsError {
    pub(crate) fn io(path: &VfsPath, source: std::io::Error) -> Self {
        match source.kind() {
            std::io::ErrorKind::NotFound => VfsError::NotFound(path.clone()),
            std::io::ErrorKind::AlreadyExists => VfsError::AlreadyExists(path.clone()),
            _ => VfsError::Io {
                path: path.clone(),
                source,
            },
        }
    }
}
