//! 데몬과 클라이언트가 주고받는 메시지. 요청·응답은 JSON 텍스트 프레임, 파일 내용은 바이너리 프레임이다.
//!
//! 연결 순서: 클라이언트 `Hello` → 데몬 `Welcome`(또는 `Rejected` 후 닫음) → 요청 하나에 응답 하나.
//! `Read`는 `Reply::Stream` 뒤에 바이너리 청크들이 오고 `Reply::End`(또는 `Reply::Err`)로 끝난다.

use serde::{Deserialize, Serialize};
use td_vfs::{Entry, VfsError, VfsPath};

/// 두 쪽이 같아야 연결된다. 메시지 모양이 바뀌면 올린다.
pub const PROTOCOL_VERSION: u32 = 1;

/// 파일 내용을 나눠 보내는 크기.
pub const CHUNK_SIZE: usize = 256 * 1024;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Hello {
    Hello { version: u32, token: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Greeting {
    Welcome { version: u32 },
    Rejected { reason: Rejection },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Rejection {
    Token,
    Version { server: u32 },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Request {
    List { dir: VfsPath, show_hidden: bool },
    Stat { path: VfsPath },
    ReadHead { path: VfsPath, max: usize },
    Read { path: VfsPath },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Reply {
    Entries { entries: Vec<Entry> },
    Entry { entry: Entry },
    Bytes { data: Vec<u8> },
    Stream,
    End,
    Err { error: RemoteError },
}

/// 네트워크를 건너는 `VfsError`. 종류를 지켜서 받는 쪽이 같은 `VfsError`로 되돌린다.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RemoteError {
    NotFound { path: VfsPath },
    AlreadyExists { path: VfsPath },
    Other { path: VfsPath, message: String },
}

impl RemoteError {
    pub fn from_vfs(e: &VfsError) -> Self {
        match e {
            VfsError::NotFound(p) => RemoteError::NotFound { path: p.clone() },
            VfsError::AlreadyExists(p) => RemoteError::AlreadyExists { path: p.clone() },
            VfsError::Other { path, message } => RemoteError::Other {
                path: path.clone(),
                message: message.clone(),
            },
            VfsError::Io { path, source } => RemoteError::Other {
                path: path.clone(),
                message: source.to_string(),
            },
        }
    }

    pub fn into_vfs(self) -> VfsError {
        match self {
            RemoteError::NotFound { path } => VfsError::NotFound(path),
            RemoteError::AlreadyExists { path } => VfsError::AlreadyExists(path),
            RemoteError::Other { path, message } => VfsError::Other { path, message },
        }
    }
}
