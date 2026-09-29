use td_vfs::{VfsError, VfsPath};

#[derive(Debug, thiserror::Error)]
pub enum OpsError {
    #[error(transparent)]
    Vfs(#[from] VfsError),
    #[error("대상이 원본 자신이거나 그 하위입니다: {0}")]
    DestInsideSource(VfsPath),
    #[error("같은 파일을 덮어쓸 수 없습니다: {0}")]
    SameFile(VfsPath),
    #[error("잘못된 이름: {0}")]
    InvalidName(String),
    #[error("휴지통 이동 실패: {0}")]
    Trash(String),
    #[error("작업이 중단되었습니다")]
    Aborted,
}

pub type Result<T> = std::result::Result<T, OpsError>;
