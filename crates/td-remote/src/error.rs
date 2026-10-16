#[derive(Debug, Clone, thiserror::Error, PartialEq, Eq)]
pub enum RemoteError {
    /// 사용자 이름이나 비밀번호가 틀렸거나 비밀번호가 없다.
    #[error("인증에 실패했습니다. 사용자 이름과 비밀번호를 확인하세요")]
    Auth,
    #[error("SFTP 서버 키 확인이 필요합니다: {0:?}")]
    HostKey(Box<crate::HostKeyChallenge>),
    #[error("서버에 연결할 수 없습니다")]
    Unreachable,
    #[error("찾을 수 없음: {0}")]
    NotFound(String),
    #[error("이미 존재함: {0}")]
    AlreadyExists(String),
    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, RemoteError>;
