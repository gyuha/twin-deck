//! 외부 프로그램 실행: 파일 관리자에서 보기, 편집기로 열기, 기본 프로그램으로 실행.
//! 명령 조립(`*_command`)은 순수 함수라 모든 OS의 결과를 테스트할 수 있고, 실제 실행은 `Launcher` trait 뒤에 둔다.

use std::process::Command as Process;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Mac,
    Windows,
    Linux,
}

impl Os {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Os::Mac
        } else if cfg!(windows) {
            Os::Windows
        } else {
            Os::Linux
        }
    }
}

/// 셸을 거치지 않고 인수 배열로 직접 실행하는 명령 (docs/06 §6: 선택 항목 이름의 메타문자 안전).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Command {
    pub program: String,
    pub args: Vec<String>,
}

impl Command {
    fn new(program: &str, args: impl IntoIterator<Item = String>) -> Self {
        Self {
            program: program.to_string(),
            args: args.into_iter().collect(),
        }
    }
}

fn parent_of(path: &str) -> String {
    match path.trim_end_matches(['/', '\\']).rfind(['/', '\\']) {
        Some(0) => "/".to_string(),
        Some(i) => path[..i].to_string(),
        None => ".".to_string(),
    }
}

/// 파일 관리자에서 `path`를 보여 주는 명령. `is_dir`이면 그 폴더를 연다.
pub fn reveal_command(os: Os, path: &str, is_dir: bool) -> Command {
    match os {
        // 파일은 Finder에서 선택된 상태로, 폴더는 그 폴더를 연다.
        Os::Mac if is_dir => Command::new("open", [path.to_string()]),
        Os::Mac => Command::new("open", ["-R".to_string(), path.to_string()]),
        Os::Windows if is_dir => Command::new("explorer", [path.to_string()]),
        Os::Windows => Command::new("explorer", [format!("/select,{path}")]),
        // xdg-open은 항목 선택을 지원하지 않는다: 파일이면 부모 폴더를 연다.
        Os::Linux if is_dir => Command::new("xdg-open", [path.to_string()]),
        Os::Linux => Command::new("xdg-open", [parent_of(path)]),
    }
}

/// 파일을 운영체제 기본 프로그램으로 실행하는 명령. 셸을 거치지 않는다(Windows는 `cmd /c start` 대신 explorer).
pub fn open_command(os: Os, path: &str) -> Command {
    match os {
        Os::Mac => Command::new("open", [path.to_string()]),
        Os::Windows => Command::new("explorer", [path.to_string()]),
        Os::Linux => Command::new("xdg-open", [path.to_string()]),
    }
}

/// `environment.text_editor`로 `paths`를 여는 명령.
/// macOS에서 경로 구분자가 없는 이름("Visual Studio Code")은 앱 이름으로 보고 `open -a`를 쓴다.
pub fn editor_command(os: Os, editor: &str, paths: &[String]) -> Result<Command, String> {
    let editor = editor.trim();
    if editor.is_empty() {
        return Err("환경 설정 [environment] text_editor가 비어 있습니다".into());
    }
    if paths.is_empty() {
        return Err("열 항목이 없습니다".into());
    }
    let looks_like_app = !editor.contains('/') && !editor.contains('\\');
    if os == Os::Mac && looks_like_app && !editor.contains('.') {
        let mut args = vec!["-a".to_string(), editor.to_string()];
        args.extend(paths.iter().cloned());
        return Ok(Command::new("open", args));
    }
    Ok(Command::new(editor, paths.iter().cloned()))
}

/// 따옴표(`"`, `'`)를 풀면서 공백으로 나눈다. 닫히지 않은 따옴표는 오류.
fn split_args(s: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    for c in s.chars() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => cur.push(c),
            None if c == '"' || c == '\'' => {
                quote = Some(c);
                started = true;
            }
            None if c.is_whitespace() => {
                if started {
                    out.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            None => {
                cur.push(c);
                started = true;
            }
        }
    }
    if quote.is_some() {
        return Err("애플리케이션 값의 따옴표가 닫히지 않았습니다".into());
    }
    if started {
        out.push(cur);
    }
    Ok(out)
}

/// F키 애플리케이션 값을 실행 파일(또는 앱)과 추가 옵션으로 나눈다(`wt -d`, `code -r`).
/// - 따옴표로 시작하면 따옴표 안이 프로그램이다.
/// - 경로 형태(첫 단어에 `/`나 `\`가 있음)이거나 macOS면 공백이 든 경로/앱 이름일 수 있으므로, 첫 `-옵션` 앞까지를 프로그램으로 본다.
/// - 그 밖에는 첫 단어가 프로그램이고 나머지가 옵션이다(`wezterm start --cwd`).
fn split_app(os: Os, app: &str) -> Result<(String, Vec<String>), String> {
    if let Some(q) = app.chars().next().filter(|c| *c == '"' || *c == '\'') {
        let rest = &app[1..];
        let end = rest
            .find(q)
            .ok_or("애플리케이션 값의 따옴표가 닫히지 않았습니다")?;
        return Ok((rest[..end].to_string(), split_args(&rest[end + 1..])?));
    }
    let first = app.split_whitespace().next().unwrap_or("");
    let path_like = first.contains('/') || first.contains('\\');
    if path_like || os == Os::Mac {
        // 첫 단어가 아닌 단어 중 `-`로 시작하는 첫 단어의 위치
        let mut offset = 0;
        for (i, word) in app.split_whitespace().enumerate() {
            let at = offset + app[offset..].find(word).unwrap_or(0);
            if i > 0 && word.starts_with('-') {
                return Ok((app[..at].trim().to_string(), split_args(&app[at..])?));
            }
            offset = at + word.len();
        }
        return Ok((app.to_string(), Vec::new()));
    }
    let mut words = split_args(app)?.into_iter();
    let program = words.next().unwrap_or_default();
    Ok((program, words.collect()))
}

/// F키에 지정한 애플리케이션으로 `paths`를 여는 명령. 값에 `wt -d`처럼 옵션이 붙어 있으면 `paths` 앞에 넣는다.
/// macOS에서 `.app` 번들이거나 경로 구분자가 없는 이름("Preview")이면 `open -a`를 쓰고(옵션이 있으면 `open -n -a <앱> --args <옵션> <경로>`),
/// 그 밖에는 실행 파일을 직접 실행한다.
pub fn app_command(os: Os, app: &str, paths: &[String]) -> Result<Command, String> {
    let app = app.trim();
    if app.is_empty() {
        return Err("애플리케이션이 지정되지 않았습니다".into());
    }
    if paths.is_empty() {
        return Err("전달할 항목이 없습니다".into());
    }
    let (program, options) = split_app(os, app)?;
    if program.is_empty() {
        return Err("애플리케이션이 지정되지 않았습니다".into());
    }
    let is_bundle = program.trim_end_matches(['/', '\\']).ends_with(".app");
    let is_name = !program.contains('/') && !program.contains('\\');
    if os == Os::Mac && (is_bundle || is_name) {
        let mut args = vec!["-a".to_string(), program];
        if !options.is_empty() {
            // 옵션은 새 인스턴스에만 전달된다
            args.insert(0, "-n".to_string());
            args.push("--args".to_string());
            args.extend(options);
        }
        args.extend(paths.iter().cloned());
        return Ok(Command::new("open", args));
    }
    Ok(Command::new(
        &program,
        options.into_iter().chain(paths.iter().cloned()),
    ))
}

/// 명령을 실제로 실행한다. 테스트는 기록하는 fake를 쓴다.
pub trait Launcher {
    fn run(&self, cmd: &Command) -> Result<(), String>;
}

/// 프로세스를 띄우고 기다리지 않는다.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemLauncher;

impl Launcher for SystemLauncher {
    fn run(&self, cmd: &Command) -> Result<(), String> {
        let mut program = cmd.program.clone();
        if cfg!(windows) {
            let dirs: Vec<_> = std::env::var_os("PATH")
                .map(|p| std::env::split_paths(&p).collect())
                .unwrap_or_default();
            program = resolve_windows_program(&program, &dirs);
        }
        let mut process = Process::new(&program);
        process.args(&cmd.args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let lower = program.to_ascii_lowercase();
            if lower.ends_with(".cmd") || lower.ends_with(".bat") {
                process.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: cmd.exe 창이 깜빡이지 않게 한다
            }
        }
        process
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("{program} 실행 실패: {e}"))
    }
}

/// Windows는 확장자가 없으면 `.exe`만 찾는다. VS Code의 `bin\code`처럼 쉘 스크립트와 `code.cmd`만 있는 경우를 위해
/// `.exe`, `.com`, `.cmd`, `.bat` 순으로 실제 파일을 찾아 돌려준다. 경로가 없는 이름은 `search` 폴더들에서 찾는다.
/// 확장자가 있거나 찾지 못하면 그대로 돌려준다.
pub fn resolve_windows_program(program: &str, search: &[std::path::PathBuf]) -> String {
    if std::path::Path::new(program).extension().is_some() {
        return program.to_string();
    }
    let has_dir = program.contains('/') || program.contains('\\');
    let bases: Vec<std::path::PathBuf> = if has_dir {
        vec![std::path::PathBuf::from(program)]
    } else {
        search.iter().map(|d| d.join(program)).collect()
    };
    for base in bases {
        for ext in ["exe", "com", "cmd", "bat"] {
            let mut candidate = base.clone().into_os_string();
            candidate.push(format!(".{ext}"));
            let candidate = std::path::PathBuf::from(candidate);
            if candidate.is_file() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }
    program.to_string()
}

/// 명령 조립과 실행을 묶은 진입점.
pub struct Launch<L: Launcher> {
    launcher: L,
    os: Os,
}

impl<L: Launcher> Launch<L> {
    pub fn new(launcher: L, os: Os) -> Self {
        Self { launcher, os }
    }

    pub fn reveal(&self, path: &str, is_dir: bool) -> Result<(), String> {
        self.launcher.run(&reveal_command(self.os, path, is_dir))
    }

    pub fn open(&self, path: &str) -> Result<(), String> {
        self.launcher.run(&open_command(self.os, path))
    }

    pub fn edit(&self, editor: &str, paths: &[String]) -> Result<(), String> {
        self.launcher.run(&editor_command(self.os, editor, paths)?)
    }

    pub fn launch_app(&self, app: &str, paths: &[String]) -> Result<(), String> {
        self.launcher.run(&app_command(self.os, app, paths)?)
    }
}
