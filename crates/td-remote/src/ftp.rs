//! FTP(평문) 세션. 메타데이터 명령은 재사용하는 제어 연결로, 전송은 전송마다 새 연결로 한다.

use std::io::{self, Read, Write};
use std::net::ToSocketAddrs;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use suppaftp::list::ListParser;
use suppaftp::types::FileType;
use suppaftp::{FtpError, FtpStream, ImplFtpStream, Status, TlsStream, TransferStream};

use crate::{
    file_name, is_plain_name, join, parent, RemoteEntry, RemoteError, RemoteKind, RemoteSession,
    RemoteWrite, Result,
};

const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone)]
pub struct FtpConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}

pub struct FtpSession {
    cfg: FtpConfig,
    ctrl: Mutex<Option<FtpStream>>,
}

fn map_err(path: &str, e: FtpError) -> RemoteError {
    match e {
        FtpError::UnexpectedResponse(r) => match r.status {
            Status::NotLoggedIn => RemoteError::Auth,
            Status::FileUnavailable => RemoteError::NotFound(path.to_string()),
            _ => RemoteError::Other(String::from_utf8_lossy(&r.body).trim().to_string()),
        },
        FtpError::ConnectionError(e) => match e.kind() {
            io::ErrorKind::ConnectionRefused
            | io::ErrorKind::TimedOut
            | io::ErrorKind::ConnectionReset
            | io::ErrorKind::ConnectionAborted
            | io::ErrorKind::NotConnected
            | io::ErrorKind::UnexpectedEof => RemoteError::Unreachable,
            _ => RemoteError::Other(e.to_string()),
        },
        other => RemoteError::Other(other.to_string()),
    }
}

fn io_err(e: FtpError) -> io::Error {
    io::Error::other(e.to_string())
}

impl FtpSession {
    /// 접속하고 로그인한다. 실패하면 `Auth`(자격 증명)나 `Unreachable`(연결).
    pub fn connect(cfg: FtpConfig) -> Result<Self> {
        let conn = open(&cfg)?;
        Ok(Self {
            cfg,
            ctrl: Mutex::new(Some(conn)),
        })
    }

    /// 제어 연결로 작업한다. 끊겨 있으면 한 번 다시 연결해 재시도한다.
    fn with_ctrl<T>(
        &self,
        path: &str,
        mut f: impl FnMut(&mut FtpStream) -> std::result::Result<T, FtpError>,
    ) -> Result<T> {
        let mut guard = self.ctrl.lock().unwrap();
        for attempt in 0..2 {
            if guard.is_none() {
                *guard = Some(open(&self.cfg)?);
            }
            match f(guard.as_mut().unwrap()) {
                Ok(v) => return Ok(v),
                Err(FtpError::ConnectionError(_)) | Err(FtpError::BadResponse) if attempt == 0 => {
                    *guard = None;
                }
                Err(e) => return Err(map_err(path, e)),
            }
        }
        Err(RemoteError::Unreachable)
    }
}

fn open(cfg: &FtpConfig) -> Result<FtpStream> {
    let addr = (cfg.host.as_str(), cfg.port)
        .to_socket_addrs()
        .map_err(|_| RemoteError::Unreachable)?
        .next()
        .ok_or(RemoteError::Unreachable)?;
    let mut s = FtpStream::connect_timeout(addr, TIMEOUT).map_err(|e| map_err("", e))?;
    s.login(cfg.user.as_str(), cfg.password.as_str())
        .map_err(|e| map_err("", e))?;
    s.transfer_type(FileType::Binary)
        .map_err(|e| map_err("", e))?;
    // 서버가 지원하면 UTF-8 이름을 쓴다. 지원하지 않아도 무시한다.
    let _ = s.opts("UTF8", Some("ON"));
    Ok(s)
}

fn entry_of(line: &str) -> Option<RemoteEntry> {
    // MLSD 줄은 `type=...;` 사실 목록으로 시작한다. 그렇지 않으면 LIST(유닉스·DOS) 형식이다.
    let f = if line.to_ascii_lowercase().contains("type=") {
        ListParser::parse_mlsd(line).ok()?
    } else {
        ListParser::parse_posix(line)
            .or_else(|_| ListParser::parse_dos(line))
            .ok()?
    };
    let name = f.name().to_string();
    // 서버가 준 이름은 믿지 않는다: `../x` 같은 이름이 복사 때 대상 폴더 밖에 쓰지 않게 평범한 이름만 남긴다.
    if !is_plain_name(&name) {
        return None;
    }
    let kind = if f.is_directory() {
        RemoteKind::Dir
    } else if f.is_symlink() {
        RemoteKind::Symlink
    } else {
        RemoteKind::File
    };
    Some(RemoteEntry {
        name,
        kind,
        size: f.size() as u64,
        modified: Some(f.modified()).filter(|t| *t > SystemTime::UNIX_EPOCH),
    })
}

fn list_dir(s: &mut FtpStream, dir: &str) -> std::result::Result<Vec<RemoteEntry>, FtpError> {
    let lines = match s.mlsd(Some(dir)) {
        Ok(l) => l,
        Err(FtpError::UnexpectedResponse(_)) => s.list(Some(dir))?,
        Err(e) => return Err(e),
    };
    Ok(lines.iter().filter_map(|l| entry_of(l)).collect())
}

impl RemoteSession for FtpSession {
    fn home(&self) -> Result<String> {
        self.with_ctrl("/", |s| s.pwd())
    }

    fn list(&self, dir: &str) -> Result<Vec<RemoteEntry>> {
        self.with_ctrl(dir, |s| list_dir(s, dir))
    }

    fn stat(&self, path: &str) -> Result<RemoteEntry> {
        let Some(par) = parent(path) else {
            return Ok(RemoteEntry {
                name: "/".into(),
                kind: RemoteKind::Dir,
                size: 0,
                modified: None,
            });
        };
        let name = file_name(path).unwrap_or_default().to_string();
        self.list(&par)?
            .into_iter()
            .find(|e| e.name == name)
            .ok_or_else(|| RemoteError::NotFound(path.to_string()))
    }

    fn mkdir_all(&self, path: &str) -> Result<()> {
        let mut cur = String::new();
        for part in path.split('/').filter(|p| !p.is_empty()) {
            cur = join(if cur.is_empty() { "/" } else { &cur }, part);
            match self.with_ctrl(&cur, |s| s.mkdir(&cur)) {
                Ok(()) => {}
                // 이미 있는 폴더면 통과, 파일이거나 다른 이유면 오류.
                Err(e) => match self.stat(&cur) {
                    Ok(x) if x.kind == RemoteKind::Dir => {}
                    _ => return Err(e),
                },
            }
        }
        Ok(())
    }

    fn create_empty(&self, path: &str) -> Result<()> {
        if self.stat(path).is_ok() {
            return Err(RemoteError::AlreadyExists(path.to_string()));
        }
        self.write(path)?.finish()
    }

    fn rename(&self, from: &str, to: &str) -> Result<()> {
        self.with_ctrl(from, |s| s.rename(from, to))
    }

    fn remove_file(&self, path: &str) -> Result<()> {
        self.with_ctrl(path, |s| s.rm(path))
    }

    fn remove_dir_all(&self, path: &str) -> Result<()> {
        for e in self.list(path)? {
            let child = join(path, &e.name);
            if e.kind == RemoteKind::Dir {
                self.remove_dir_all(&child)?;
            } else {
                self.remove_file(&child)?;
            }
        }
        self.with_ctrl(path, |s| s.rmdir(path))
    }

    fn read(&self, path: &str) -> Result<Box<dyn Read + Send>> {
        let mut conn = open(&self.cfg)?;
        let stream = conn.retr_as_stream(path).map_err(|e| map_err(path, e))?;
        Ok(Box::new(FtpReader {
            stream: Some(stream),
            _conn: conn,
        }))
    }

    fn write(&self, path: &str) -> Result<Box<dyn RemoteWrite>> {
        let mut conn = open(&self.cfg)?;
        let stream = conn.put_with_stream(path).map_err(|e| map_err(path, e))?;
        Ok(Box::new(FtpWriter {
            stream: Some(stream),
            conn: Some(conn),
            path: path.to_string(),
        }))
    }
}

struct FtpReader<T: TlsStream> {
    stream: Option<TransferStream<T>>,
    _conn: ImplFtpStream<T>,
}

impl<T: TlsStream + Send> Read for FtpReader<T> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let Some(s) = self.stream.as_mut() else {
            return Ok(0);
        };
        let n = s.read(buf)?;
        if n == 0 {
            // 끝까지 읽었으면 서버의 완료 응답을 확인한다.
            if let Some(s) = self.stream.take() {
                s.finish().map_err(io_err)?;
            }
        }
        Ok(n)
    }
}

struct FtpWriter<T: TlsStream> {
    stream: Option<TransferStream<T>>,
    conn: Option<ImplFtpStream<T>>,
    path: String,
}

impl<T: TlsStream> Write for FtpWriter<T> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.stream
            .as_mut()
            .expect("writer already finished")
            .write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.stream
            .as_mut()
            .expect("writer already finished")
            .flush()
    }
}

impl<T: TlsStream + Send + 'static> RemoteWrite for FtpWriter<T> {
    fn finish(mut self: Box<Self>) -> Result<()> {
        let path = std::mem::take(&mut self.path);
        if let Some(s) = self.stream.take() {
            s.finish().map_err(|e| map_err(&path, e))?;
        }
        if let Some(mut c) = self.conn.take() {
            let _ = c.quit();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::entry_of;

    #[test]
    fn 목록의_상위_경로_이름은_항목으로_받지_않는다() {
        // MLSD
        assert!(entry_of("type=file;size=1; ../escaped.txt").is_none());
        assert!(entry_of("type=file;size=1; ../../etc/passwd").is_none());
        assert!(entry_of("type=file;size=1; /etc/passwd").is_none());
        assert!(entry_of("type=dir; ..").is_none());
        // LIST(유닉스)
        assert!(entry_of("-rw-r--r-- 1 u g 1 Jan  1 00:00 ../escaped.txt").is_none());
        assert!(entry_of("drwxr-xr-x 2 u g 0 Jan  1 00:00 ..").is_none());
    }

    #[test]
    fn 평범한_이름은_그대로_받는다() {
        assert_eq!(entry_of("type=file;size=3; a.txt").unwrap().name, "a.txt");
        assert_eq!(
            entry_of("-rw-r--r-- 1 u g 3 Jan  1 00:00 b.txt")
                .unwrap()
                .name,
            "b.txt"
        );
    }
}
