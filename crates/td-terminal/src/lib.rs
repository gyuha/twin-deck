//! 내장 터미널의 pty 세션 (TERM-01·02). 셸을 pty로 띄우고, 입력을 쓰고, 크기를 바꾸고, 닫는다.
//! 출력과 종료는 `Receiver<TermEvent>`로 흘려 보낸다.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
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

/// GUI에서 실행하면 locale이 없거나 C라서 ls가 한글 파일명을 '?'로 바꾼다.
/// 자식 PTY의 ASCII 기본 환경만 보완하며 명시적인 지역/인코딩 설정은 유지한다.
#[cfg(unix)]
fn ensure_utf8_locale(cmd: &mut CommandBuilder) {
    let effective = ["LC_ALL", "LC_CTYPE", "LANG"]
        .into_iter()
        .filter_map(|key| cmd.get_env(key).and_then(|value| value.to_str()))
        .find(|value| !value.is_empty());
    if effective.is_some_and(|value| value != "C" && value != "POSIX") {
        return;
    }
    let fallback = if cfg!(target_os = "macos") {
        "en_US.UTF-8"
    } else {
        "C.UTF-8"
    };
    let locale = cmd
        .get_env("LANG")
        .and_then(|value| value.to_str())
        .filter(|value| value.to_ascii_lowercase().replace('-', "").contains("utf8"))
        .unwrap_or(fallback)
        .to_owned();
    if cmd
        .get_env("LANG")
        .is_none_or(|value| value.is_empty() || value == "C" || value == "POSIX")
    {
        cmd.env("LANG", &locale);
    }
    cmd.env("LC_CTYPE", &locale);
    if cmd
        .get_env("LC_ALL")
        .is_some_and(|value| value == "C" || value == "POSIX")
    {
        cmd.env("LC_ALL", &locale);
    }
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
    /// 출력에서 본 커서 위치 질문(`ESC[6n`) 중 아직 답을 받지 못한 수.
    cpr_pending: Arc<AtomicUsize>,
}

/// 커서 위치 질문 `ESC[6n`.
const CPR_QUERY: &[u8] = b"\x1b[6n";

/// `chunk`에 든 커서 위치 질문의 수. 청크 경계에 걸친 질문은 앞 청크의 끝 `carry`로 잇고, 다음 번을 위해 `carry`를 갱신한다.
fn count_cpr_queries(carry: &mut Vec<u8>, chunk: &[u8]) -> usize {
    let head = carry.len();
    let mut joined = std::mem::take(carry);
    joined.extend_from_slice(chunk);
    let n = joined
        .windows(CPR_QUERY.len())
        .enumerate()
        .filter(|(i, w)| *w == CPR_QUERY && i + CPR_QUERY.len() > head)
        .count();
    let keep = joined.len().min(CPR_QUERY.len() - 1);
    carry.extend_from_slice(&joined[joined.len() - keep..]);
    n
}

/// 0이 아니면 하나 줄이고 true. (`fetch_update`는 새 툴체인에서 이름이 바뀌어 직접 돌린다.)
fn take_one(n: &AtomicUsize) -> bool {
    let mut cur = n.load(Ordering::SeqCst);
    while cur > 0 {
        match n.compare_exchange(cur, cur - 1, Ordering::SeqCst, Ordering::SeqCst) {
            Ok(_) => return true,
            Err(now) => cur = now,
        }
    }
    false
}

/// 입력 전체가 커서 위치 답(`ESC[행;열R`)인가.
fn is_cpr_reply(data: &[u8]) -> bool {
    let Some(body) = data
        .strip_prefix(b"\x1b[")
        .and_then(|d| d.strip_suffix(b"R"))
    else {
        return false;
    };
    let mut parts = body.split(|&b| b == b';');
    let num =
        |p: Option<&[u8]>| p.is_some_and(|p| !p.is_empty() && p.iter().all(u8::is_ascii_digit));
    num(parts.next()) && num(parts.next()) && parts.next().is_none()
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

    /// 같은 번호 공간에서 세션 번호를 새로 낸다(원격 셸처럼 pty 밖에서 열리는 세션용).
    pub fn alloc_id(&self) -> u32 {
        let mut n = self.next.lock().unwrap();
        let id = *n;
        *n += 1;
        id
    }

    /// 이벤트 송신기 복제본. 밖에서 열리는 세션도 같은 수신기로 출력·종료를 보낸다.
    pub fn sender(&self) -> Sender<TermEvent> {
        self.tx.clone()
    }

    /// 설정 `environment.terminal`로 고른 셸을 `cwd`에서 연다. 값은 [`resolve_shell`]을 본다.
    pub fn open(&self, shell: &str, cwd: &Path, cols: u16, rows: u16) -> Result<u32> {
        let (program, args) =
            resolve_shell(shell, cfg!(windows), &|k| std::env::var(k).ok(), &|p| {
                p.is_file()
            })?;
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        self.open_command(&program, &args, cwd, cols, rows)
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
        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);
        cmd.cwd(cwd);
        self.open_pty(cmd, cols, rows)
    }

    fn open_pty(&self, mut cmd: CommandBuilder, cols: u16, rows: u16) -> Result<u32> {
        let pair = native_pty_system()
            .openpty(size(cols, rows))
            .map_err(pty_err)?;
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        #[cfg(unix)]
        ensure_utf8_locale(&mut cmd);
        let mut child = pair.slave.spawn_command(cmd).map_err(pty_err)?;
        drop(pair.slave);
        let killer = child.clone_killer();
        let mut reader = pair.master.try_clone_reader().map_err(pty_err)?;
        let writer = pair.master.take_writer().map_err(pty_err)?;

        let id = self.alloc_id();
        let cpr_pending = Arc::new(AtomicUsize::new(0));
        self.sessions.lock().unwrap().insert(
            id,
            Session {
                master: pair.master,
                writer,
                killer,
                cpr_pending: Arc::clone(&cpr_pending),
            },
        );
        let tx = self.tx.clone();
        let sessions = Arc::clone(&self.sessions);
        // Windows(ConPTY)는 자식이 끝나도 pty를 닫기 전에는 읽기가 끝나지 않는다. 그래서 자식 대기를 따로 두고,
        // 끝나면 세션(pty)을 닫아 읽기 스레드가 남은 출력을 다 보낸 뒤 EOF로 끝나게 한다.
        let (code_tx, code_rx) = channel();
        let waiter_sessions = Arc::clone(&self.sessions);
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|s| s.exit_code());
            let _ = code_tx.send(code);
            waiter_sessions.lock().unwrap().remove(&id);
        });
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut carry = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        // 화면이 답하기 전에 센다(답이 먼저 들어와 버려지는 일이 없게).
                        cpr_pending
                            .fetch_add(count_cpr_queries(&mut carry, &buf[..n]), Ordering::SeqCst);
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
            let code = code_rx.recv().ok().flatten();
            sessions.lock().unwrap().remove(&id);
            let _ = tx.send(TermEvent::Exit { id, code });
        });
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let s = sessions.get_mut(&id).ok_or(TerminalError::NoSession(id))?;
        // 질문 없이 온 커서 위치 답(화면이 같은 질문에 두 번 답한 경우 등)은 버린다. 셸 입력으로 들어가면 Git Bash가 `R`을 찍는다.
        if is_cpr_reply(data) && !take_one(&s.cpr_pending) {
            return Ok(());
        }
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

/// `environment.terminal` 값을 실행할 프로그램과 인수로 푼다. `env`는 환경 변수, `exists`는 파일 존재 여부(시험에서 바꿔 끼운다).
/// Windows에서만 `cmd`·`powershell`·`gitbash`를 고를 수 있고, 그 밖의 값(`default` 포함)과 다른 OS는 `$SHELL`(없으면 `/bin/sh`, Windows는 `COMSPEC`)을 로그인 셸(`-l`)로 연다.
pub fn resolve_shell(
    choice: &str,
    windows: bool,
    env: &dyn Fn(&str) -> Option<String>,
    exists: &dyn Fn(&Path) -> bool,
) -> Result<(String, Vec<String>)> {
    let comspec = || env("COMSPEC").unwrap_or_else(|| "cmd.exe".into());
    if !windows {
        let shell = env("SHELL")
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "/bin/sh".into());
        // 로그인 셸로 연다: Finder·Dock으로 띄운 앱은 최소 PATH만 받아서, `.zprofile`의 Homebrew 경로 등이 있어야 brew로 설치한 도구를 찾는다(이슈 #64).
        return Ok((shell, vec!["-l".into()]));
    }
    match choice {
        "cmd" => Ok((comspec(), vec![])),
        "powershell" => Ok(("powershell.exe".into(), vec!["-NoLogo".into()])),
        "gitbash" => {
            // Git for Windows의 bash. System32의 bash.exe는 WSL이라 후보에 넣지 않는다.
            let roots = [
                env("ProgramFiles"),
                env("ProgramFiles(x86)"),
                env("LOCALAPPDATA").map(|p| format!("{p}\\Programs")),
            ];
            roots
                .into_iter()
                .flatten()
                .map(|r| Path::new(&r).join("Git").join("bin").join("bash.exe"))
                .find(|p| exists(p))
                .map(|p| {
                    (
                        p.to_string_lossy().into_owned(),
                        vec!["--login".into(), "-i".into()],
                    )
                })
                .ok_or_else(|| {
                    TerminalError::Pty(
                        "Git Bash를 찾지 못했습니다 (Git for Windows가 필요합니다)".into(),
                    )
                })
        }
        _ => Ok((comspec(), vec![])),
    }
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

    fn env_of<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |k| {
            pairs
                .iter()
                .find(|(n, _)| *n == k)
                .map(|(_, v)| v.to_string())
        }
    }

    #[test]
    fn windows_셸_선택은_cmd_powershell_gitbash를_각자_프로그램으로_푼다() {
        let env = env_of(&[
            ("COMSPEC", "C:\\Windows\\System32\\cmd.exe"),
            ("ProgramFiles", "C:\\Program Files"),
        ]);
        let git = Path::new("C:\\Program Files")
            .join("Git")
            .join("bin")
            .join("bash.exe");
        let exists = |p: &Path| p == git;

        let (p, a) = resolve_shell("cmd", true, &env, &exists).unwrap();
        assert_eq!((p.as_str(), a.len()), ("C:\\Windows\\System32\\cmd.exe", 0));
        let (p, a) = resolve_shell("powershell", true, &env, &exists).unwrap();
        assert_eq!(
            (p.as_str(), a),
            ("powershell.exe", vec!["-NoLogo".to_string()])
        );
        let (p, a) = resolve_shell("gitbash", true, &env, &exists).unwrap();
        assert_eq!(Path::new(&p), git);
        assert_eq!(a, vec!["--login".to_string(), "-i".to_string()]);
    }

    #[test]
    fn windows에서_default와_모르는_값은_comspec이고_gitbash가_없으면_오류다() {
        let env = env_of(&[("COMSPEC", "C:\\x\\cmd.exe")]);
        for choice in ["default", "", "zsh"] {
            assert_eq!(
                resolve_shell(choice, true, &env, &|_| false).unwrap().0,
                "C:\\x\\cmd.exe"
            );
        }
        let err = resolve_shell("gitbash", true, &env, &|_| false).unwrap_err();
        assert!(err.to_string().contains("Git Bash"), "{err}");
    }

    #[cfg(windows)]
    #[test]
    fn windows에서_powershell과_cmd를_실제로_pty로_연다() {
        let dir = tempfile::tempdir().unwrap();
        let mut shells = vec![("powershell", "Write-Output (6*7)\r"), ("cmd", "echo 42\r")];
        // Git for Windows가 있는 PC에서만 gitbash도 확인한다.
        if resolve_shell("gitbash", true, &|k| std::env::var(k).ok(), &|p| {
            p.is_file()
        })
        .is_ok()
        {
            shells.push(("gitbash", "echo $((6*7))\r"));
        }
        for (shell, cmd) in shells {
            let (t, rx) = Terminals::new();
            let id = t.open(shell, dir.path(), 80, 24).unwrap();
            // ConPTY는 시작할 때 커서 위치를 묻고(`ESC[6n`) 답을 받아야 출력을 이어 간다. 화면(xterm 계열)이 하는 답을 시험에서 대신한다.
            collect_until(&rx, id, "\u{1b}[6n");
            t.write(id, b"\x1b[1;1R").unwrap();
            t.write(id, cmd.as_bytes()).unwrap();
            collect_until(&rx, id, "42");
            t.close(id).unwrap();
        }
    }

    #[test]
    fn 커서_위치_질문은_청크_경계에_걸려도_한_번만_센다() {
        let mut carry = Vec::new();
        assert_eq!(count_cpr_queries(&mut carry, b"a\x1b[6nb\x1b[6n"), 2);
        assert_eq!(count_cpr_queries(&mut carry, b"x\x1b[6"), 0);
        assert_eq!(count_cpr_queries(&mut carry, b"n y"), 1);
        assert_eq!(count_cpr_queries(&mut carry, b"\x1b[6n"), 1);
        assert_eq!(
            count_cpr_queries(&mut carry, b"\x1b[6n"),
            1,
            "연달아 온 질문도 각각 센다"
        );
        assert_eq!(count_cpr_queries(&mut carry, b"plain"), 0);
    }

    #[test]
    fn 커서_위치_답은_입력_전체가_정확히_그_모양일_때만_알아본다() {
        assert!(is_cpr_reply(b"\x1b[1;1R"));
        assert!(is_cpr_reply(b"\x1b[24;120R"));
        for no in [
            &b"R"[..],
            b"\x1b[R",
            b"\x1b[1R",
            b"\x1b[1;R",
            b"\x1b[;1R",
            b"\x1b[1;2;3R",
            b"\x1b[1;1Rx",
            b"x\x1b[1;1R",
            b"\x1b[1;1",
            b"\x1b[I",
        ] {
            assert!(!is_cpr_reply(no), "{no:?}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows에서_질문_없는_커서_위치_답은_셸에_들어가지_않는다() {
        let (t, rx) = Terminals::new();
        let dir = tempfile::tempdir().unwrap();
        let id = t.open("gitbash", dir.path(), 80, 24);
        let Ok(id) = id else { return }; // Git for Windows가 없는 PC
        collect_until(&rx, id, "\u{1b}[6n");
        // 한 번은 질문의 답, 나머지 둘은 질문 없는 답이다. 둘째·셋째가 셸에 들어가면 입력 줄에 `R`이 남는다.
        for _ in 0..3 {
            t.write(id, b"\x1b[1;1R").unwrap();
        }
        let out = collect_until(&rx, id, "\u{276f}");
        std::thread::sleep(Duration::from_millis(800));
        while let Ok(TermEvent::Output { data, .. }) = rx.try_recv() {
            assert!(
                !String::from_utf8_lossy(&data).contains('R'),
                "{data:?} {out:?}"
            );
        }
        t.close(id).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows에서_exit로_셸이_끝나면_종료_이벤트가_온다() {
        let dir = tempfile::tempdir().unwrap();
        for shell in ["cmd", "powershell"] {
            let (t, rx) = Terminals::new();
            let id = t.open(shell, dir.path(), 80, 24).unwrap();
            collect_until(&rx, id, "\u{1b}[6n");
            t.write(id, b"\x1b[1;1R").unwrap();
            t.write(id, b"exit\r").unwrap();
            wait_exit(&rx, id);
        }
    }

    #[test]
    fn windows가_아니면_선택과_상관없이_shell_환경_변수를_쓴다() {
        let env = env_of(&[("SHELL", "/bin/zsh")]);
        assert_eq!(
            resolve_shell("powershell", false, &env, &|_| true)
                .unwrap()
                .0,
            "/bin/zsh"
        );
        assert_eq!(
            resolve_shell("cmd", false, &env_of(&[]), &|_| true)
                .unwrap()
                .0,
            "/bin/sh"
        );
    }

    #[test]
    fn resolve_shell_unix_args_are_login() {
        let env = env_of(&[("SHELL", "/bin/zsh")]);
        assert_eq!(
            resolve_shell("default", false, &env, &|_| true).unwrap(),
            ("/bin/zsh".to_string(), vec!["-l".to_string()])
        );
        assert_eq!(
            resolve_shell("default", false, &env_of(&[]), &|_| true).unwrap(),
            ("/bin/sh".to_string(), vec!["-l".to_string()])
        );
    }

    /// 이슈 #64: 로그인 셸이어야 `.zprofile`(Homebrew `brew shellenv` 등)도 적용된다.
    #[cfg(unix)]
    #[test]
    fn login_shell_loads_zprofile_and_zshrc() {
        if !Path::new("/bin/zsh").exists() {
            return;
        }
        let home = tempfile::tempdir().unwrap();
        std::fs::write(
            home.path().join(".zprofile"),
            "export TD_PROFILE=from_profile\n",
        )
        .unwrap();
        std::fs::write(home.path().join(".zshrc"), "export TD_RC=from_rc\n").unwrap();
        let (program, args) =
            resolve_shell("default", false, &env_of(&[("SHELL", "/bin/zsh")]), &|_| {
                true
            })
            .unwrap();
        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);
        cmd.env("HOME", home.path());
        cmd.env("ZDOTDIR", home.path());
        cmd.cwd(home.path());
        let (t, rx) = Terminals::new();
        let id = t.open_pty(cmd, 80, 24).unwrap();
        t.write(id, b"echo P=$TD_PROFILE R=$TD_RC\r").unwrap();
        collect_until(&rx, id, "P=from_profile R=from_rc");
        t.close(id).unwrap();
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
    fn locale이_없거나_ascii이면_자식_명령만_utf8로_보완한다() {
        for locale in [None, Some(""), Some("C"), Some("POSIX")] {
            let mut cmd = CommandBuilder::new("/bin/sh");
            cmd.env_clear();
            if let Some(locale) = locale {
                cmd.env("LC_ALL", locale);
            }
            ensure_utf8_locale(&mut cmd);
            let expected = if cfg!(target_os = "macos") {
                "en_US.UTF-8"
            } else {
                "C.UTF-8"
            };
            assert_eq!(cmd.get_env("LANG"), Some(expected.as_ref()));
            assert_eq!(cmd.get_env("LC_CTYPE"), Some(expected.as_ref()));
            if matches!(locale, Some("C" | "POSIX")) {
                assert_eq!(cmd.get_env("LC_ALL"), Some(expected.as_ref()));
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn 명시한_locale은_우선순위대로_보존한다() {
        for (key, locale) in [
            ("LANG", "ko_KR.UTF-8"),
            ("LC_CTYPE", "UTF-8"),
            ("LC_ALL", "ja_JP.UTF-8"),
            ("LC_CTYPE", "ko_KR.EUC-KR"),
        ] {
            let mut cmd = CommandBuilder::new("/bin/sh");
            cmd.env_clear();
            cmd.env("LANG", "C");
            cmd.env(key, locale);
            ensure_utf8_locale(&mut cmd);
            assert_eq!(cmd.get_env(key), Some(locale.as_ref()));
            if key != "LANG" {
                assert_eq!(cmd.get_env("LANG"), Some("C".as_ref()));
            }
        }
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.env_clear();
        cmd.env("LANG", "ko_KR.UTF-8");
        cmd.env("LC_CTYPE", "C");
        ensure_utf8_locale(&mut cmd);
        assert_eq!(cmd.get_env("LC_CTYPE"), Some("ko_KR.UTF-8".as_ref()));
        assert_eq!(cmd.get_env("LANG"), Some("ko_KR.UTF-8".as_ref()));
    }

    #[cfg(unix)]
    #[test]
    fn gui처럼_locale이_없어도_pty의_ls는_한글_파일명을_보존한다() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["한글폴더", "한글"] {
            std::fs::create_dir(dir.path().join(name)).unwrap();
        }
        for key in [None, Some("LANG"), Some("LC_CTYPE"), Some("LC_ALL")] {
            let mut cmd = CommandBuilder::new("/bin/sh");
            cmd.args(["-c", "/bin/ls -1; printf '\\n__TD_DONE__\\n'"]);
            cmd.env_clear();
            cmd.env("PATH", "/usr/bin:/bin");
            if let Some(key) = key {
                cmd.env(key, "C");
            }
            cmd.cwd(dir.path());
            let (t, rx) = Terminals::new();
            let id = t.open_pty(cmd, 80, 24).unwrap();
            let out = collect_until(&rx, id, "__TD_DONE__");
            assert!(out.contains("한글폴더"), "{key:?}: {out:?}");
            assert!(out.contains("한글"), "{key:?}: {out:?}");
            assert!(!out.contains('?'), "{key:?}: {out:?}");
        }
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
