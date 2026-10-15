//! 원격 접속(ADR-0018): 원격 PC의 Twin Deck이 데몬으로 `Vfs`를 WebSocket으로 내보내고, 로컬은 `RemoteFs`로 붙는다.

pub mod cli;
mod client;
mod path;
mod protocol;
mod server;

pub use client::{ConnectError, HostConfig, RemoteFs};
pub use path::{split_remote_path, to_remote_path, SCHEME};
pub use protocol::PROTOCOL_VERSION;
pub use server::{new_token, ServeFs, Server};
