//! `td` 명령(이슈 #45)의 인수 해석. 터미널에서 넘긴 경로를 앱의 왼쪽·오른쪽 패널에 열 요청으로 바꾼다.

use std::path::{Path, PathBuf};

/// 패널에 열 한 곳. 파일을 주면 그 파일이 든 폴더를 열고 `focus`에 파일 이름을 둔다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenTarget {
    pub folder: String,
    pub focus: Option<String>,
}

/// 왼쪽·오른쪽 패널에 열 요청. 둘 다 없으면 앱만 띄우거나 앞으로 가져온다.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OpenRequest {
    pub left: Option<OpenTarget>,
    pub right: Option<OpenTarget>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CliError {
    /// 없는 경로(입력한 그대로).
    NotFound(String),
    /// 인수가 3개 이상이거나 지원하지 않는 옵션.
    Usage(String),
}

impl CliError {
    /// 종료 코드: 없는 경로 1, 사용법 오류 2.
    pub fn exit_code(&self) -> i32 {
        match self {
            CliError::NotFound(_) => 1,
            CliError::Usage(_) => 2,
        }
    }

    pub fn message(&self) -> String {
        match self {
            CliError::NotFound(p) => format!("경로를 찾을 수 없습니다: {p}"),
            CliError::Usage(_) => USAGE.to_string(),
        }
    }
}

pub const USAGE: &str =
    "사용법: td [폴더 [폴더]]  (첫 폴더는 왼쪽 패널, 둘째는 오른쪽 패널에 새 탭으로 엽니다)";

/// 프로그램 이름을 뺀 인수(`argv[1..]`)를 해석한다. 상대 경로는 `cwd` 기준으로 절대 경로가 된다.
pub fn parse_args(args: &[String], cwd: &Path) -> Result<OpenRequest, CliError> {
    if args.len() > 2 {
        return Err(CliError::Usage(format!(
            "경로는 최대 2개입니다: {}개",
            args.len()
        )));
    }
    if let Some(opt) = args.iter().find(|a| a.starts_with('-')) {
        return Err(CliError::Usage(format!("지원하지 않는 옵션: {opt}")));
    }
    let mut targets = args.iter().map(|a| target(a, cwd));
    let left = targets.next().transpose()?;
    let right = targets.next().transpose()?;
    Ok(OpenRequest { left, right })
}

/// 한 인수를 열 곳으로 바꾼다. 폴더면 그 폴더, 파일이면 그 파일이 든 폴더와 파일 이름, 없으면 `NotFound`.
fn target(arg: &str, cwd: &Path) -> Result<OpenTarget, CliError> {
    let abs = absolute(arg, cwd);
    let meta = std::fs::metadata(&abs).map_err(|_| CliError::NotFound(arg.to_string()))?;
    if meta.is_dir() {
        return Ok(OpenTarget {
            folder: abs.to_string_lossy().into_owned(),
            focus: None,
        });
    }
    let name = abs.file_name().map(|n| n.to_string_lossy().into_owned());
    let folder = abs.parent().unwrap_or(&abs).to_string_lossy().into_owned();
    Ok(OpenTarget {
        folder,
        focus: name,
    })
}

/// `cwd`를 기준으로 절대 경로를 만든다. `.`·`..`는 문자열로만 정리하고 심볼릭 링크는 풀지 않는다(셸이 보여 주는 경로 그대로).
fn absolute(path: &str, cwd: &Path) -> PathBuf {
    use std::path::Component;
    let joined = cwd.join(path);
    let mut out = PathBuf::new();
    for c in joined.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// `argv[0]`의 파일 이름이 정확히 `td`인가.
pub fn invoked_as_td(argv0: &str) -> bool {
    Path::new(argv0).file_name().is_some_and(|n| n == "td")
}

/// 터미널에서 떨어져 나와 자기 자신을 다시 실행할지: `td`로 불렸고, 이미 떨어져 나온 프로세스가 아니며, 인수가 올바를 때만(unix).
pub fn should_detach(argv0: &str, detached_env: Option<&str>, args_ok: bool) -> bool {
    cfg!(unix) && invoked_as_td(argv0) && detached_env.is_none() && args_ok
}

/// 설치 파일이 앱을 한 번 실행해 `td` 명령을 설치·제거하게 하는 플래그(`--td-install-cli`, `--td-uninstall-cli`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManageFlag {
    Install,
    Uninstall,
}

/// `argv[1..]`가 정확히 하나의 관리 플래그면 그것을 돌려준다. 다른 인수가 같이 있으면 `None`이다.
pub fn manage_flag(args: &[String]) -> Option<ManageFlag> {
    match args {
        [a] if a == "--td-install-cli" => Some(ManageFlag::Install),
        [a] if a == "--td-uninstall-cli" => Some(ManageFlag::Uninstall),
        _ => None,
    }
}

/// 관리 플래그를 실행하고 종료 코드(성공 0, 실패 1)를 돌려준다. 화면 없이 `td-cli`의 설치·제거만 한다.
pub fn run_manage(flag: ManageFlag) -> i32 {
    let exe = match std::env::current_exe().and_then(std::fs::canonicalize) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("td: 앱 실행 파일 위치를 알 수 없습니다: {e}");
            return 1;
        }
    };
    let done = match flag {
        ManageFlag::Install => td_cli::install(&exe),
        ManageFlag::Uninstall => td_cli::uninstall(&exe),
    };
    match done {
        Ok(_) => 0,
        Err(e) => {
            eprintln!("td: {e}");
            1
        }
    }
}

/// 앱이 시작될 때 받은 인수(`argv[1..]`)를 해석한다. macOS가 붙이는 `-psn_…` 같은 시스템 인수는 무시한다.
pub fn launch_request(args: &[String], cwd: &Path) -> Result<OpenRequest, CliError> {
    let own: Vec<String> = args
        .iter()
        .filter(|a| !a.starts_with("-psn_"))
        .cloned()
        .collect();
    parse_args(&own, cwd)
}

/// `td`로 불렸을 때(unix): 인수가 틀렸으면 터미널에 오류를 내고 종료 코드로 끝나고, 맞으면 자기 자신을 새 프로세스로 다시 실행한 뒤
/// 종료 코드 0으로 끝나 터미널을 돌려준다. `td`가 아니거나 이미 떨어져 나온 프로세스면 아무것도 하지 않고 돌아온다.
#[cfg(unix)]
pub fn detach_if_td() {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    let argv: Vec<String> = std::env::args().collect();
    let Some(argv0) = argv.first() else { return };
    if !invoked_as_td(argv0) {
        return;
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    let rest = &argv[1..];
    let checked = parse_args(rest, &cwd);
    let detached = std::env::var("TD_DETACHED").ok();
    if let Err(e) = &checked {
        eprintln!("td: {}", e.message());
        std::process::exit(e.exit_code());
    }
    if !should_detach(argv0, detached.as_deref(), checked.is_ok()) {
        return;
    }
    // 링크(`/opt/homebrew/bin/td` 등)가 아니라 실제 실행 파일로 다시 띄운다: 링크 경로로 뜨면 앱 번들의 리소스 폴더를 못 찾는다.
    let exe = match std::env::current_exe().and_then(std::fs::canonicalize) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("td: 실행 파일 위치를 알 수 없습니다: {e}");
            std::process::exit(1);
        }
    };
    let spawned = Command::new(exe)
        .args(rest)
        .current_dir(&cwd)
        .env("TD_DETACHED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn();
    match spawned {
        Ok(_) => std::process::exit(0),
        Err(e) => {
            eprintln!("td: Twin Deck을 실행하지 못했습니다: {e}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    fn tree() -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(t.path().join("a/sub")).unwrap();
        std::fs::create_dir_all(t.path().join("b")).unwrap();
        std::fs::create_dir_all(t.path().join("with space")).unwrap();
        std::fs::write(t.path().join("a/file.txt"), "x").unwrap();
        t
    }

    fn folder(t: &tempfile::TempDir, rel: &str) -> String {
        t.path().join(rel).to_string_lossy().into_owned()
    }

    #[test]
    fn no_args_is_an_empty_request() {
        let t = tree();
        assert_eq!(parse_args(&[], t.path()), Ok(OpenRequest::default()));
    }

    #[test]
    fn dot_and_relative_paths_become_absolute_from_cwd() {
        let t = tree();
        let cwd = t.path().join("a");
        let r = parse_args(&s(&["."]), &cwd).unwrap();
        assert_eq!(
            r.left,
            Some(OpenTarget {
                folder: folder(&t, "a"),
                focus: None
            })
        );
        assert_eq!(r.right, None);
        let r = parse_args(&s(&["sub"]), &cwd).unwrap();
        assert_eq!(r.left.unwrap().folder, folder(&t, "a/sub"));
    }

    #[test]
    fn parent_dir_is_resolved_lexically_without_following_symlinks() {
        let t = tree();
        let cwd = t.path().join("a/sub");
        let r = parse_args(&s(&[".."]), &cwd).unwrap();
        assert_eq!(r.left.unwrap().folder, folder(&t, "a"));
        let r = parse_args(&s(&["../../b"]), &cwd).unwrap();
        assert_eq!(r.left.unwrap().folder, folder(&t, "b"));
    }

    #[test]
    fn absolute_path_is_kept_and_spaces_survive() {
        let t = tree();
        let abs = folder(&t, "with space");
        let r = parse_args(&s(&[&abs]), Path::new("/")).unwrap();
        assert_eq!(r.left.unwrap().folder, abs);
    }

    #[test]
    fn two_paths_go_to_left_and_right() {
        let t = tree();
        let r = parse_args(&s(&["a", "b"]), t.path()).unwrap();
        assert_eq!(r.left.unwrap().folder, folder(&t, "a"));
        assert_eq!(r.right.unwrap().folder, folder(&t, "b"));
    }

    #[test]
    fn a_file_opens_its_folder_and_focuses_the_file() {
        let t = tree();
        let r = parse_args(&s(&["a/file.txt"]), t.path()).unwrap();
        assert_eq!(
            r.left,
            Some(OpenTarget {
                folder: folder(&t, "a"),
                focus: Some("file.txt".into())
            })
        );
    }

    #[test]
    fn missing_path_is_not_found_with_exit_code_1() {
        let t = tree();
        let e = parse_args(&s(&["nope"]), t.path()).unwrap_err();
        assert_eq!(e, CliError::NotFound("nope".into()));
        assert_eq!(e.exit_code(), 1);
        assert!(e.message().contains("nope"));
        // 둘째 경로가 없어도 같다
        assert_eq!(
            parse_args(&s(&["a", "nope"]), t.path())
                .unwrap_err()
                .exit_code(),
            1
        );
    }

    #[test]
    fn three_paths_and_options_are_usage_errors_with_exit_code_2() {
        let t = tree();
        let e = parse_args(&s(&["a", "b", "a"]), t.path()).unwrap_err();
        assert_eq!(e.exit_code(), 2);
        assert!(e.message().contains("td"));
        assert_eq!(
            parse_args(&s(&["--new-window"]), t.path())
                .unwrap_err()
                .exit_code(),
            2
        );
        assert_eq!(
            parse_args(&s(&["a", "-x"]), t.path())
                .unwrap_err()
                .exit_code(),
            2
        );
    }

    #[test]
    fn only_the_exact_name_td_counts_as_invoked_as_td() {
        assert!(invoked_as_td("td"));
        assert!(invoked_as_td("/usr/local/bin/td"));
        assert!(invoked_as_td("/opt/homebrew/bin/td"));
        assert!(!invoked_as_td("twin-deck-desktop"));
        assert!(!invoked_as_td("/x/td-old"));
        assert!(!invoked_as_td("mytd"));
        assert!(!invoked_as_td(""));
    }

    #[test]
    fn detaches_only_when_called_as_td_not_yet_detached_and_args_ok() {
        let unix = cfg!(unix);
        assert_eq!(should_detach("td", None, true), unix);
        assert!(!should_detach("td", Some("1"), true)); // 이미 떨어져 나온 프로세스
        assert!(!should_detach("td", None, false)); // 인수가 틀리면 떨어지지 않고 오류로 끝난다
        assert!(!should_detach("twin-deck-desktop", None, true)); // tauri dev·Finder 실행
    }

    #[test]
    fn manage_flags_are_recognized_only_when_alone() {
        assert_eq!(
            manage_flag(&s(&["--td-install-cli"])),
            Some(ManageFlag::Install)
        );
        assert_eq!(
            manage_flag(&s(&["--td-uninstall-cli"])),
            Some(ManageFlag::Uninstall)
        );
        assert_eq!(manage_flag(&[]), None);
        assert_eq!(manage_flag(&s(&["--td-install-cli", "x"])), None);
        assert_eq!(
            manage_flag(&s(&["--td-install-cli", "--td-uninstall-cli"])),
            None
        );
        assert_eq!(manage_flag(&s(&["a"])), None);
        assert_eq!(manage_flag(&s(&["--td-install"])), None);
    }

    #[test]
    fn manage_flags_are_not_valid_td_arguments() {
        let t = tree();
        // 사용자가 `td --td-install-cli`로 불러도 폴더 인수로 해석되지 않고 사용법 오류다
        assert_eq!(
            parse_args(&s(&["--td-install-cli"]), t.path())
                .unwrap_err()
                .exit_code(),
            2
        );
    }
}
