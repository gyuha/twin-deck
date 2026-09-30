use std::io;

#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("입출력 오류: {0}")]
    Io(#[from] io::Error),
    #[error("아카이브 형식 오류: {0}")]
    Format(String),
    #[error("아카이브 안에 없음: {0}")]
    NotFound(String),
    #[error("안전하지 않은 항목이라 추출하지 않았습니다: {name} ({reason})")]
    Unsafe { name: String, reason: &'static str },
    #[error("읽기 전용 아카이브입니다: {0}")]
    ReadOnly(&'static str),
    #[error("이미 있어서 덮어쓰지 않았습니다: {0}")]
    Exists(String),
    #[error("지원하지 않는 형식입니다: {0}")]
    Unsupported(String),
}

pub type Result<T> = std::result::Result<T, ArchiveError>;

impl From<zip::result::ZipError> for ArchiveError {
    fn from(e: zip::result::ZipError) -> Self {
        match e {
            zip::result::ZipError::Io(e) => ArchiveError::Io(e),
            other => ArchiveError::Format(other.to_string()),
        }
    }
}
