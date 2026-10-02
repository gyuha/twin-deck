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

/// 명령을 실제로 실행한다. 테스트는 기록하는 fake를 쓴다.
pub trait Launcher {
    fn run(&self, cmd: &Command) -> Result<(), String>;
}

/// 프로세스를 띄우고 기다리지 않는다.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemLauncher;

impl Launcher for SystemLauncher {
    fn run(&self, cmd: &Command) -> Result<(), String> {
        Process::new(&cmd.program)
            .args(&cmd.args)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("{} 실행 실패: {e}", cmd.program))
    }
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
}
