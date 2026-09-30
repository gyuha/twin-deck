use crate::VfsPath;

#[derive(Debug, thiserror::Error)]
pub enum VfsError {
    #[error("찾을 수 없음: {0}")]
    NotFound(VfsPath),
    #[error("이미 존재함: {0}")]
    AlreadyExists(VfsPath),
    /// 파일시스템 오류가 아닌 계층(아카이브 등)이 낸 오류.
    #[error("{path}: {message}")]
    Other { path: VfsPath, message: String },
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
