//! 내장 터미널의 pty 세션 (TERM-01·02). 셸을 pty로 띄우고, 입력을 쓰고, 크기를 바꾸고, 닫는다.
//! 출력과 종료는 `Receiver<TermEvent>`로 흘려 보낸다.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};

#[derive(Debug, thiserror::Error)]
pub enum TerminalError {
    #[error("터미널 세션 {0}번이 없습니다")]
    NoSession(u32),
    #[error("{0}")]
    Pty(String),
}

pub type Result<T> = std::result::Result<T, TerminalError>;

fn pty_err(e: impl std::fmt::Display) -> TerminalError {
    TerminalError::Pty(e.to_string())
}

/// 세션이 밖으로 내보내는 이벤트.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TermEvent {
    /// pty가 낸 바이트. UTF-8 글자 중간에서 잘릴 수 있다.
    Output { id: u32, data: Vec<u8> },
    /// 셸이 끝났다. 종료 코드를 알면 담는다.
    Exit { id: u32, code: Option<u32> },
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

/// 열려 있는 터미널 세션들.
pub struct Terminals {
    next: Mutex<u32>,
    sessions: Arc<Mutex<HashMap<u32, Session>>>,
    tx: Sender<TermEvent>,
}

impl Terminals {
    pub fn new() -> (Self, Receiver<TermEvent>) {
        let (tx, rx) = channel();
        (
            Self {
                next: Mutex::new(1),
                sessions: Arc::new(Mutex::new(HashMap::new())),
                tx,
            },
            rx,
        )
    }

    /// 사용자의 셸(`$SHELL`, 없으면 `/bin/sh`, Windows는 `cmd.exe`)을 `cwd`에서 연다.
    pub fn open(&self, cwd: &Path, cols: u16, rows: u16) -> Result<u32> {
        self.open_command(&default_shell(), &[], cwd, cols, rows)
    }

    /// 지정한 프로그램을 pty로 연다(테스트와 셸 지정용).
    pub fn open_command(
        &self,
        program: &str,
        args: &[&str],
        cwd: &Path,
        cols: u16,
        rows: u16,
    ) -> Result<u32> {
        let pair = native_pty_system()
            .openpty(size(cols, rows))
            .map_err(pty_err)?;
        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);
        cmd.cwd(cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        let mut child = pair.slave.spawn_command(cmd).map_err(pty_err)?;
        drop(pair.slave);
        let killer = child.clone_killer();
        let mut reader = pair.master.try_clone_reader().map_err(pty_err)?;
        let writer = pair.master.take_writer().map_err(pty_err)?;

        let id = {
            let mut n = self.next.lock().unwrap();
            let id = *n;
            *n += 1;
            id
        };
        self.sessions.lock().unwrap().insert(
            id,
            Session {
                master: pair.master,
                writer,
                killer,
            },
        );
        let tx = self.tx.clone();
        let sessions = Arc::clone(&self.sessions);
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tx
                            .send(TermEvent::Output {
                                id,
                                data: buf[..n].to_vec(),
                            })
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
            let code = child.wait().ok().map(|s| s.exit_code());
            sessions.lock().unwrap().remove(&id);
            let _ = tx.send(TermEvent::Exit { id, code });
        });
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let s = sessions.get_mut(&id).ok_or(TerminalError::NoSession(id))?;
        s.writer.write_all(data).map_err(pty_err)?;
        s.writer.flush().map_err(pty_err)
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        let s = sessions.get(&id).ok_or(TerminalError::NoSession(id))?;
        s.master.resize(size(cols, rows)).map_err(pty_err)
    }

    /// 세션을 끝낸다. 프로세스를 죽이면 읽기 스레드가 `Exit`을 낸다. 이미 없는 세션이면 오류 없이 지나간다.
    pub fn close(&self, id: u32) -> Result<()> {
        if let Some(mut s) = self.sessions.lock().unwrap().remove(&id) {
            let _ = s.killer.kill();
        }
        Ok(())
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn default_shell() -> String {
    if cfg!(windows) {
        return std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into());
    }
    std::env::var("SHELL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/sh".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// `id`의 출력을 `want`가 보일 때까지 모은다.
    fn collect_until(rx: &Receiver<TermEvent>, id: u32, want: &str) -> String {
        let mut out = String::new();
        let end = Instant::now() + Duration::from_secs(10);
        while Instant::now() < end {
            if let Ok(TermEvent::Output { id: i, data }) =
                rx.recv_timeout(Duration::from_millis(200))
            {
                if i == id {
                    out.push_str(&String::from_utf8_lossy(&data));
                    if out.contains(want) {
                        return out;
                    }
                }
            }
        }
        panic!("출력에 {want:?}가 없다: {out:?}");
    }

    fn wait_exit(rx: &Receiver<TermEvent>, id: u32) -> Option<u32> {
        let end = Instant::now() + Duration::from_secs(10);
        while Instant::now() < end {
            if let Ok(TermEvent::Exit { id: i, code }) = rx.recv_timeout(Duration::from_millis(200))
            {
                if i == id {
                    return code;
                }
            }
        }
        panic!("종료 이벤트가 오지 않았다");
    }

    #[cfg(unix)]
    #[test]
    fn output_arrives_and_runs_in_the_given_folder() {
        let dir = tempfile::tempdir().unwrap();
        let (t, rx) = Terminals::new();
        let id = t
            .open_command("/bin/sh", &["-c", "echo hello; pwd"], dir.path(), 80, 24)
            .unwrap();
        let out = collect_until(&rx, id, &dir.path().file_name().unwrap().to_string_lossy());
        assert!(out.contains("hello"), "{out:?}");
    }

    #[cfg(unix)]
    #[test]
    fn exit_code_comes_as_an_exit_event() {
        let dir = tempfile::tempdir().unwrap();
        let (t, rx) = Terminals::new();
        let id = t
            .open_command("/bin/sh", &["-c", "exit 3"], dir.path(), 80, 24)
            .unwrap();
        assert_eq!(wait_exit(&rx, id), Some(3));
        assert!(matches!(
            t.write(id, b"x"),
            Err(TerminalError::NoSession(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn written_input_is_echoed_back() {
        let dir = tempfile::tempdir().unwrap();
        let (t, rx) = Terminals::new();
        let id = t.open_command("/bin/cat", &[], dir.path(), 80, 24).unwrap();
        t.write(id, "안녕 ping\n".as_bytes()).unwrap();
        collect_until(&rx, id, "안녕 ping");
        t.close(id).unwrap();
        wait_exit(&rx, id);
    }

    #[cfg(unix)]
    #[test]
    fn resize_works_and_close_ends_the_process() {
        let dir = tempfile::tempdir().unwrap();
        let (t, rx) = Terminals::new();
        let id = t
            .open_command("/bin/sh", &["-c", "sleep 60"], dir.path(), 80, 24)
            .unwrap();
        t.resize(id, 120, 40).unwrap();
        t.close(id).unwrap();
        wait_exit(&rx, id); // sleep이 죽어 종료 이벤트가 온다(60초를 기다리지 않는다)
        assert!(t.resize(id, 10, 10).is_err());
        t.close(id).unwrap(); // 이미 없어도 오류가 아니다
    }

    #[test]
    fn unknown_session_is_an_error() {
        let (t, _rx) = Terminals::new();
        assert!(matches!(
            t.write(99, b"x"),
            Err(TerminalError::NoSession(99))
        ));
        assert!(matches!(
            t.resize(99, 1, 1),
            Err(TerminalError::NoSession(99))
        ));
    }
}
