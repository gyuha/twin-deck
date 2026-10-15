//! 데몬 쪽: 접속마다 스레드 하나로 핸드셰이크 후 요청을 처리한다.

use std::fs::File;
use std::io::{self, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;

use td_vfs::{ListOptions, LocalFs, Vfs, VfsError, VfsPath};
use tungstenite::{Message, WebSocket};

use crate::protocol::{
    Greeting, Hello, Rejection, RemoteError, Reply, Request, CHUNK_SIZE, PROTOCOL_VERSION,
};

/// 데몬이 내보낼 수 있는 파일시스템. 목록·읽기 외에 파일 내용을 흘려 보내는 읽기가 필요하다.
pub trait ServeFs: Vfs {
    /// 파일 전체를 `out`에 쓰고 쓴 바이트 수를 돌려준다.
    fn read_to(&self, path: &VfsPath, out: &mut dyn Write) -> td_vfs::Result<u64>;
}

impl ServeFs for LocalFs {
    fn read_to(&self, path: &VfsPath, out: &mut dyn Write) -> td_vfs::Result<u64> {
        let open = |p: &std::path::Path| File::open(p);
        let mut file = match open(path.as_path()) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => td_vfs::nfd_path(path.as_path())
                .and_then(|alt| open(&alt).ok())
                .ok_or_else(|| VfsError::NotFound(path.clone()))?,
            Err(e) => return Err(io_err(path, e)),
            Ok(f) => f,
        };
        io::copy(&mut file, out).map_err(|e| io_err(path, e))
    }
}

fn io_err(path: &VfsPath, e: io::Error) -> VfsError {
    match e.kind() {
        io::ErrorKind::NotFound => VfsError::NotFound(path.clone()),
        _ => VfsError::Io {
            path: path.clone(),
            source: e,
        },
    }
}

type Shared = Arc<dyn ServeFs + Send + Sync>;

pub struct Server {
    listener: TcpListener,
    token: Arc<String>,
    fs: Shared,
}

impl Server {
    pub fn bind(addr: &str, token: String, fs: Shared) -> io::Result<Self> {
        Ok(Self {
            listener: TcpListener::bind(addr)?,
            token: Arc::new(token),
            fs,
        })
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.listener.local_addr().expect("열린 소켓의 주소")
    }

    /// 접속을 받는 루프를 돌린다(돌아오지 않는다).
    pub fn run(self) {
        for stream in self.listener.incoming().flatten() {
            let (token, fs) = (self.token.clone(), self.fs.clone());
            thread::spawn(move || {
                let _ = serve_connection(stream, &token, fs.as_ref());
            });
        }
    }

    /// 접속 루프를 백그라운드 스레드에서 돌린다.
    pub fn spawn(self) -> thread::JoinHandle<()> {
        thread::spawn(move || self.run())
    }
}

/// 페어링 토큰을 OS 난수로 만든다(32바이트, 16진수).
pub fn new_token() -> String {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).expect("OS 난수를 읽을 수 없다");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn same_token(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}

fn send_json<T: serde::Serialize>(ws: &mut WebSocket<TcpStream>, v: &T) -> tungstenite::Result<()> {
    ws.send(Message::text(serde_json::to_string(v).expect("직렬화")))
}

/// 다음 텍스트 프레임을 읽는다. 닫힘이나 형식 오류면 None.
fn read_text(ws: &mut WebSocket<TcpStream>) -> Option<String> {
    loop {
        match ws.read().ok()? {
            Message::Text(t) => return Some(t.as_str().to_owned()),
            Message::Ping(_) | Message::Pong(_) => continue,
            _ => return None,
        }
    }
}

fn serve_connection(
    stream: TcpStream,
    token: &str,
    fs: &(dyn ServeFs + Send + Sync),
) -> Option<()> {
    let _ = stream.set_nodelay(true);
    let mut ws = tungstenite::accept(stream).ok()?;
    let Hello::Hello {
        version,
        token: given,
    } = serde_json::from_str(&read_text(&mut ws)?).ok()?;
    let rejection = if version != PROTOCOL_VERSION {
        Some(Rejection::Version {
            server: PROTOCOL_VERSION,
        })
    } else if !same_token(&given, token) {
        Some(Rejection::Token)
    } else {
        None
    };
    if let Some(reason) = rejection {
        let _ = send_json(&mut ws, &Greeting::Rejected { reason });
        let _ = ws.close(None);
        let _ = ws.flush();
        return None;
    }
    send_json(
        &mut ws,
        &Greeting::Welcome {
            version: PROTOCOL_VERSION,
        },
    )
    .ok()?;

    loop {
        let req: Request = serde_json::from_str(&read_text(&mut ws)?).ok()?;
        let reply = match req {
            Request::List { dir, show_hidden } => fs
                .list(&dir, &ListOptions { show_hidden })
                .map(|entries| Reply::Entries { entries }),
            Request::Stat { path } => fs.stat(&path).map(|entry| Reply::Entry { entry }),
            Request::ReadHead { path, max } => {
                fs.read_head(&path, max).map(|data| Reply::Bytes { data })
            }
            Request::Read { path } => {
                stream_file(&mut ws, fs, &path).ok()?;
                continue;
            }
        };
        let reply = reply.unwrap_or_else(|e| Reply::Err {
            error: RemoteError::from_vfs(&e),
        });
        send_json(&mut ws, &reply).ok()?;
    }
}

/// 파일 내용을 청크로 보낸다. 시작 전 오류는 `Err` 하나로, 도중 오류는 청크 뒤의 `Err`로 알린다.
fn stream_file(
    ws: &mut WebSocket<TcpStream>,
    fs: &(dyn ServeFs + Send + Sync),
    path: &VfsPath,
) -> tungstenite::Result<()> {
    let mut out = ChunkWriter {
        ws,
        buf: Vec::with_capacity(CHUNK_SIZE),
        started: false,
        failed: None,
    };
    let result = fs.read_to(path, &mut out);
    let flushed = out.send_buf();
    if let Some(e) = out.failed.take() {
        return Err(e);
    }
    flushed.map_err(|_| tungstenite::Error::ConnectionClosed)?;
    let end = match result {
        Ok(_) => {
            out.start()?;
            Reply::End
        }
        Err(e) => Reply::Err {
            error: RemoteError::from_vfs(&e),
        },
    };
    send_json(out.ws, &end)
}

struct ChunkWriter<'a> {
    ws: &'a mut WebSocket<TcpStream>,
    buf: Vec<u8>,
    started: bool,
    failed: Option<tungstenite::Error>,
}

impl ChunkWriter<'_> {
    fn start(&mut self) -> tungstenite::Result<()> {
        if !self.started {
            self.started = true;
            send_json(self.ws, &Reply::Stream)?;
        }
        Ok(())
    }

    fn send_buf(&mut self) -> io::Result<()> {
        if self.buf.is_empty() {
            return Ok(());
        }
        let data = std::mem::replace(&mut self.buf, Vec::with_capacity(CHUNK_SIZE));
        let sent = self
            .start()
            .and_then(|_| self.ws.send(Message::binary(data)));
        sent.map_err(|e| {
            self.failed = Some(e);
            io::Error::new(io::ErrorKind::BrokenPipe, "원격 연결이 끊겼다")
        })
    }
}

impl Write for ChunkWriter<'_> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        let n = data.len().min(CHUNK_SIZE - self.buf.len());
        self.buf.extend_from_slice(&data[..n]);
        if self.buf.len() == CHUNK_SIZE {
            self.send_buf()?;
        }
        Ok(n)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
