//! 테스트용 가짜 FTP 서버. 같은 프로세스에서 로컬 TCP로 뜬다(`testing` 기능).

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;

use crate::{FtpConfig, FtpSession};

pub const USER: &str = "u";
pub const PASS: &str = "p";

/// 임시 폴더를 루트로 하는 가짜 FTP 서버. 값이 버려지면 임시 폴더가 지워진다.
pub struct FakeFtp {
    pub port: u16,
    root: tempfile::TempDir,
}

impl FakeFtp {
    pub fn start(mlsd: bool) -> Self {
        let root = tempfile::tempdir().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let base = Arc::new(root.path().to_path_buf());
        thread::spawn(move || {
            for conn in listener.incoming() {
                let Ok(conn) = conn else { break };
                let base = base.clone();
                thread::spawn(move || serve(conn, &base, mlsd));
            }
        });
        Self { port, root }
    }

    pub fn path(&self, rel: &str) -> PathBuf {
        self.root.path().join(rel)
    }

    pub fn connect(&self) -> FtpSession {
        FtpSession::connect(self.cfg(USER, PASS)).unwrap()
    }

    pub fn cfg(&self, user: &str, pass: &str) -> FtpConfig {
        FtpConfig {
            host: "127.0.0.1".into(),
            port: self.port,
            user: user.into(),
            password: pass.into(),
        }
    }
}

fn say(w: &mut TcpStream, s: &str) {
    let _ = w.write_all(format!("{s}\r\n").as_bytes());
}

fn resolve(base: &Path, cwd: &str, arg: &str) -> (String, PathBuf) {
    let joined = if arg.starts_with('/') {
        arg.to_string()
    } else {
        format!("{}/{}", cwd.trim_end_matches('/'), arg)
    };
    let mut parts: Vec<&str> = Vec::new();
    for p in joined.split('/').filter(|p| !p.is_empty() && *p != ".") {
        if p == ".." {
            parts.pop();
        } else {
            parts.push(p);
        }
    }
    let virt = format!("/{}", parts.join("/"));
    let mut real = base.to_path_buf();
    real.extend(&parts);
    (virt, real)
}

fn unix_line(meta: &fs::Metadata, name: &str) -> String {
    let kind = if meta.is_dir() { 'd' } else { '-' };
    format!(
        "{kind}rw-r--r--   1 owner group {:>10} Oct 19  2020 {name}",
        meta.len()
    )
}

fn mlsd_line(meta: &fs::Metadata, name: &str) -> String {
    let kind = if meta.is_dir() { "dir" } else { "file" };
    format!(
        "type={kind};size={};modify=20201019151900; {name}",
        meta.len()
    )
}

fn serve(stream: TcpStream, base: &Path, mlsd: bool) {
    let mut w = stream.try_clone().unwrap();
    let mut r = BufReader::new(stream);
    say(&mut w, "220 fake ftp");
    let mut cwd = "/".to_string();
    let mut authed = false;
    let mut user_ok = false;
    let mut pasv: Option<TcpListener> = None;
    let mut rnfr: Option<PathBuf> = None;
    let mut line = String::new();
    loop {
        line.clear();
        if r.read_line(&mut line).unwrap_or(0) == 0 {
            return;
        }
        let l = line.trim_end_matches(['\r', '\n']);
        let (cmd, arg) = l.split_once(' ').unwrap_or((l, ""));
        let cmd = cmd.to_ascii_uppercase();
        match cmd.as_str() {
            "USER" => {
                user_ok = arg == USER;
                say(&mut w, "331 password please");
            }
            "PASS" => {
                if user_ok && arg == PASS {
                    authed = true;
                    say(&mut w, "230 ok");
                } else {
                    say(&mut w, "530 Login incorrect");
                }
            }
            "QUIT" => {
                say(&mut w, "221 bye");
                return;
            }
            _ if !authed => say(&mut w, "530 Please login"),
            "TYPE" | "OPTS" | "NOOP" => say(&mut w, "200 ok"),
            "PWD" => say(&mut w, &format!("257 \"{cwd}\" is current")),
            "CWD" => {
                let (v, p) = resolve(base, &cwd, arg);
                if p.is_dir() {
                    cwd = v;
                    say(&mut w, "250 ok");
                } else {
                    say(&mut w, "550 no such dir");
                }
            }
            "PASV" => {
                let l = TcpListener::bind("127.0.0.1:0").unwrap();
                let port = l.local_addr().unwrap().port();
                say(
                    &mut w,
                    &format!(
                        "227 Entering Passive Mode (127,0,0,1,{},{})",
                        port / 256,
                        port % 256
                    ),
                );
                pasv = Some(l);
            }
            "LIST" | "MLSD" => {
                if cmd == "MLSD" && !mlsd {
                    say(&mut w, "500 MLSD not supported");
                    continue;
                }
                let target = if arg.is_empty() { "." } else { arg };
                let (_, real) = resolve(base, &cwd, target);
                let Ok(rd) = fs::read_dir(&real) else {
                    say(&mut w, "550 no such dir");
                    continue;
                };
                let Some(l) = pasv.take() else {
                    say(&mut w, "425 use PASV first");
                    continue;
                };
                say(&mut w, "150 listing");
                let (mut data, _) = l.accept().unwrap();
                for e in rd.flatten() {
                    let meta = e.metadata().unwrap();
                    let name = e.file_name().to_string_lossy().into_owned();
                    let out = if cmd == "MLSD" {
                        mlsd_line(&meta, &name)
                    } else {
                        unix_line(&meta, &name)
                    };
                    let _ = data.write_all(format!("{out}\r\n").as_bytes());
                }
                drop(data);
                say(&mut w, "226 done");
            }
            "RETR" => {
                let (_, real) = resolve(base, &cwd, arg);
                let Ok(bytes) = fs::read(&real) else {
                    say(&mut w, "550 no such file");
                    continue;
                };
                let Some(l) = pasv.take() else {
                    say(&mut w, "425 use PASV first");
                    continue;
                };
                say(&mut w, "150 sending");
                let (mut data, _) = l.accept().unwrap();
                let _ = data.write_all(&bytes);
                drop(data);
                say(&mut w, "226 done");
            }
            "STOR" => {
                let (_, real) = resolve(base, &cwd, arg);
                let Some(l) = pasv.take() else {
                    say(&mut w, "425 use PASV first");
                    continue;
                };
                if real.parent().is_none_or(|p| !p.is_dir()) {
                    say(&mut w, "550 no such dir");
                    continue;
                }
                say(&mut w, "150 receiving");
                let (mut data, _) = l.accept().unwrap();
                let mut buf = Vec::new();
                let _ = data.read_to_end(&mut buf);
                fs::write(&real, buf).unwrap();
                say(&mut w, "226 done");
            }
            "MKD" => {
                let (v, real) = resolve(base, &cwd, arg);
                match fs::create_dir(&real) {
                    Ok(()) => say(&mut w, &format!("257 \"{v}\" created")),
                    Err(_) => say(&mut w, "550 cannot create"),
                }
            }
            "RMD" => {
                let (_, real) = resolve(base, &cwd, arg);
                match fs::remove_dir(&real) {
                    Ok(()) => say(&mut w, "250 removed"),
                    Err(_) => say(&mut w, "550 cannot remove"),
                }
            }
            "DELE" => {
                let (_, real) = resolve(base, &cwd, arg);
                match fs::remove_file(&real) {
                    Ok(()) => say(&mut w, "250 deleted"),
                    Err(_) => say(&mut w, "550 cannot delete"),
                }
            }
            "RNFR" => {
                let (_, real) = resolve(base, &cwd, arg);
                if real.exists() {
                    rnfr = Some(real);
                    say(&mut w, "350 ready");
                } else {
                    say(&mut w, "550 no such file");
                }
            }
            "RNTO" => {
                let (_, real) = resolve(base, &cwd, arg);
                match rnfr.take().map(|f| fs::rename(f, real)) {
                    Some(Ok(())) => say(&mut w, "250 renamed"),
                    _ => say(&mut w, "550 cannot rename"),
                }
            }
            _ => say(&mut w, "502 not implemented"),
        }
    }
}
