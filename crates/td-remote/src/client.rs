//! 로컬 쪽: 원격 데몬에 붙어 `Vfs`처럼 쓴다. 요청 하나에 응답 하나라 연결 하나를 잠가 쓴다.

use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use td_vfs::{Entry, Info, ListOptions, Vfs, VfsError, VfsPath};
use tungstenite::{Message, WebSocket};

use crate::protocol::{Greeting, Hello, Rejection, Reply, Request, PROTOCOL_VERSION};

#[derive(Debug, thiserror::Error)]
pub enum ConnectError {
    #[error("원격 호스트에 연결할 수 없음: {0}")]
    Io(String),
    #[error("원격 호스트가 토큰을 거부했다")]
    Token,
    #[error("Twin Deck 원격 프로토콜 버전이 다름 (원격 {server}, 이쪽 {client})")]
    Version { server: u32, client: u32 },
    #[error("원격 호스트의 응답을 이해할 수 없음: {0}")]
    Protocol(String),
}

/// 설정에 등록한 원격 호스트 하나(`[remote.hosts.<별칭>]`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostConfig {
    pub address: String,
    pub token: String,
}

/// 응답이 없는 주소에서 패널이 오래 멈추지 않게 연결 시도는 이만큼만 기다린다.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

pub struct RemoteFs {
    ws: Mutex<WebSocket<TcpStream>>,
    /// 전송 오류로 연결 상태를 믿을 수 없게 되면 켠다. 쓰는 쪽이 다시 연결한다.
    broken: AtomicBool,
}

impl RemoteFs {
    pub fn connect(addr: &str, token: &str) -> Result<Self, ConnectError> {
        Self::connect_with_version(addr, token, PROTOCOL_VERSION)
    }

    /// 버전을 지정해 연결한다. 버전 불일치 처리를 시험하려고 둔다.
    #[doc(hidden)]
    pub fn connect_with_version(
        addr: &str,
        token: &str,
        version: u32,
    ) -> Result<Self, ConnectError> {
        let io = |e: std::io::Error| ConnectError::Io(e.to_string());
        let sock = addr
            .to_socket_addrs()
            .map_err(io)?
            .next()
            .ok_or_else(|| ConnectError::Io(format!("주소를 찾을 수 없음: {addr}")))?;
        let stream = TcpStream::connect_timeout(&sock, CONNECT_TIMEOUT).map_err(io)?;
        let _ = stream.set_nodelay(true);
        let (mut ws, _) = tungstenite::client(format!("ws://{addr}/"), stream)
            .map_err(|e| ConnectError::Io(e.to_string()))?;
        let hello = Hello::Hello {
            version,
            token: token.to_string(),
        };
        ws.send(Message::text(
            serde_json::to_string(&hello).expect("직렬화"),
        ))
        .map_err(|e| ConnectError::Io(e.to_string()))?;
        let text = read_text(&mut ws).map_err(ConnectError::Io)?;
        match serde_json::from_str(&text).map_err(|e| ConnectError::Protocol(e.to_string()))? {
            Greeting::Welcome { .. } => Ok(Self {
                ws: Mutex::new(ws),
                broken: AtomicBool::new(false),
            }),
            Greeting::Rejected {
                reason: Rejection::Token,
            } => Err(ConnectError::Token),
            Greeting::Rejected {
                reason: Rejection::Version { server },
            } => Err(ConnectError::Version {
                server,
                client: version,
            }),
        }
    }

    /// 전송 오류로 연결이 끊겼거나 응답 순서를 믿을 수 없다.
    pub fn is_broken(&self) -> bool {
        self.broken.load(Ordering::Relaxed)
    }

    fn broke(&self, e: VfsError) -> VfsError {
        self.broken.store(true, Ordering::Relaxed);
        e
    }

    /// 파일 전체를 받아 `out`에 쓰고 받은 바이트 수를 돌려준다.
    pub fn read_to(&self, path: &VfsPath, out: &mut dyn Write) -> td_vfs::Result<u64> {
        let mut ws = self.ws.lock().unwrap_or_else(|p| p.into_inner());
        send(&mut ws, &Request::Read { path: path.clone() }, path).map_err(|e| self.broke(e))?;
        match reply(&mut ws, path).map_err(|e| self.broke(e))? {
            Reply::Stream => {}
            Reply::Err { error } => return Err(error.into_vfs()),
            other => return Err(self.broke(unexpected(path, &other))),
        }
        let mut total = 0u64;
        // 이쪽 쓰기가 실패해도 남은 청크를 끝까지 읽어야 다음 요청의 응답이 어긋나지 않는다.
        let mut write_err = None;
        loop {
            match ws.read().map_err(|e| self.broke(transport(path, e)))? {
                Message::Binary(data) => {
                    if write_err.is_none() {
                        match out.write_all(&data) {
                            Ok(()) => total += data.len() as u64,
                            Err(e) => write_err = Some(e),
                        }
                    }
                }
                Message::Text(t) => match parse(path, t.as_str()).map_err(|e| self.broke(e))? {
                    Reply::End => {
                        return match write_err {
                            Some(source) => Err(VfsError::Io {
                                path: path.clone(),
                                source,
                            }),
                            None => Ok(total),
                        }
                    }
                    Reply::Err { error } => return Err(error.into_vfs()),
                    other => return Err(self.broke(unexpected(path, &other))),
                },
                Message::Ping(_) | Message::Pong(_) => {}
                _ => return Err(self.broke(other(path, "원격 연결이 끊겼다".into()))),
            }
        }
    }

    fn call(&self, req: Request, path: &VfsPath) -> td_vfs::Result<Reply> {
        let mut ws = self.ws.lock().unwrap_or_else(|p| p.into_inner());
        send(&mut ws, &req, path).map_err(|e| self.broke(e))?;
        match reply(&mut ws, path).map_err(|e| self.broke(e))? {
            Reply::Err { error } => Err(error.into_vfs()),
            ok => Ok(ok),
        }
    }
}

fn read_text(ws: &mut WebSocket<TcpStream>) -> Result<String, String> {
    loop {
        match ws.read().map_err(|e| e.to_string())? {
            Message::Text(t) => return Ok(t.as_str().to_owned()),
            Message::Ping(_) | Message::Pong(_) => continue,
            _ => return Err("원격 연결이 끊겼다".into()),
        }
    }
}

fn send(ws: &mut WebSocket<TcpStream>, req: &Request, path: &VfsPath) -> td_vfs::Result<()> {
    ws.send(Message::text(serde_json::to_string(req).expect("직렬화")))
        .map_err(|e| transport(path, e))
}

fn reply(ws: &mut WebSocket<TcpStream>, path: &VfsPath) -> td_vfs::Result<Reply> {
    let text = read_text(ws).map_err(|m| other(path, m))?;
    parse(path, &text)
}

fn parse(path: &VfsPath, text: &str) -> td_vfs::Result<Reply> {
    serde_json::from_str(text).map_err(|e| other(path, format!("원격 응답 형식 오류: {e}")))
}

fn other(path: &VfsPath, message: String) -> VfsError {
    VfsError::Other {
        path: path.clone(),
        message,
    }
}

fn transport(path: &VfsPath, e: tungstenite::Error) -> VfsError {
    other(path, format!("원격 연결 오류: {e}"))
}

fn unexpected(path: &VfsPath, reply: &Reply) -> VfsError {
    other(path, format!("원격 응답이 예상과 다름: {reply:?}"))
}

fn unsupported(path: &VfsPath) -> VfsError {
    other(path, "원격 경로에서는 아직 지원하지 않음".into())
}

impl Vfs for RemoteFs {
    fn list(&self, dir: &VfsPath, opts: &ListOptions) -> td_vfs::Result<Vec<Entry>> {
        match self.call(
            Request::List {
                dir: dir.clone(),
                show_hidden: opts.show_hidden,
            },
            dir,
        )? {
            Reply::Entries { entries } => Ok(entries),
            other => Err(unexpected(dir, &other)),
        }
    }

    fn stat(&self, path: &VfsPath) -> td_vfs::Result<Entry> {
        match self.call(Request::Stat { path: path.clone() }, path)? {
            Reply::Entry { entry } => Ok(entry),
            other => Err(unexpected(path, &other)),
        }
    }

    fn read_head(&self, path: &VfsPath, max: usize) -> td_vfs::Result<Vec<u8>> {
        match self.call(
            Request::ReadHead {
                path: path.clone(),
                max,
            },
            path,
        )? {
            Reply::Bytes { data } => Ok(data),
            other => Err(unexpected(path, &other)),
        }
    }

    /// 목록 정보만 채운다(접근 시각·링크 대상·항목 수는 원격에서 아직 받지 않는다).
    fn info(&self, path: &VfsPath) -> td_vfs::Result<Info> {
        Ok(Info {
            entry: self.stat(path)?,
            accessed: None,
            link_target: None,
            child_count: None,
        })
    }

    fn mkdir(&self, path: &VfsPath) -> td_vfs::Result<()> {
        Err(unsupported(path))
    }

    fn create_file(&self, path: &VfsPath) -> td_vfs::Result<()> {
        Err(unsupported(path))
    }

    fn rename(&self, from: &VfsPath, _to: &VfsPath) -> td_vfs::Result<()> {
        Err(unsupported(from))
    }

    fn remove_file(&self, path: &VfsPath) -> td_vfs::Result<()> {
        Err(unsupported(path))
    }

    fn remove_dir_all(&self, path: &VfsPath) -> td_vfs::Result<()> {
        Err(unsupported(path))
    }

    fn copy_file(&self, from: &VfsPath, _to: &VfsPath) -> td_vfs::Result<u64> {
        Err(unsupported(from))
    }

    fn read_link(&self, path: &VfsPath) -> td_vfs::Result<VfsPath> {
        Err(unsupported(path))
    }

    fn symlink(
        &self,
        _target: &VfsPath,
        link: &VfsPath,
        _target_is_dir: bool,
    ) -> td_vfs::Result<()> {
        Err(unsupported(link))
    }

    fn can_trash(&self, _path: &VfsPath) -> bool {
        false
    }
}
