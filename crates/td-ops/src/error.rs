use td_vfs::{VfsError, VfsPath};

#[derive(Debug, thiserror::Error)]
pub enum OpsError {
    #[error(transparent)]
    Vfs(#[from] VfsError),
    #[error("대상이 원본 자신이거나 그 하위입니다: {0}")]
    DestInsideSource(VfsPath),
    #[error("원본이 덮어쓸 대상 안에 있어 덮어쓸 수 없습니다: {0}")]
    SourceInsideDest(VfsPath),
    #[error("같은 파일을 덮어쓸 수 없습니다: {0}")]
    SameFile(VfsPath),
    #[error("잘못된 이름: {0}")]
    InvalidName(String),
    #[error("휴지통 이동 실패: {0}")]
    Trash(String),
    #[error("작업이 중단되었습니다")]
    Aborted,
    #[error("{0}개 항목을 복사하지 못해 덮어쓰기를 취소하고 기존 대상을 되돌렸습니다")]
    OverwriteRolledBack(usize),
    #[error("{cause}. 기존 대상을 되돌리지 못했습니다. 이전 내용은 {aside}에 있습니다: {restore}")]
    RestoreFailed {
        cause: String,
        aside: VfsPath,
        restore: String,
    },
    #[error("{0}개 항목을 복사하지 못해 원본을 지우지 않았습니다")]
    PartialCopy(usize),
    #[error("{0}")]
    Archive(String),
}

pub type Result<T> = std::result::Result<T, OpsError>;

impl From<td_archive::ArchiveError> for OpsError {
    fn from(e: td_archive::ArchiveError) -> Self {
        match e {
            td_archive::ArchiveError::Aborted => OpsError::Aborted,
            other => OpsError::Archive(other.to_string()),
        }
    }
}
