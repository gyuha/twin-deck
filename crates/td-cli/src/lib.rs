//! `td` 명령 설치/제거(이슈 #45). macOS는 `/usr/local/bin/td` 링크, Windows는 앱 폴더의 `td.cmd`와 사용자 PATH.
//! 순수 로직(명령 문자열, PATH 편집, 링크 판단)과 실제 실행부를 나눠, 순수 로직은 어느 OS에서든 시험한다.

use std::path::Path;

/// macOS에서 `td` 링크를 두는 곳.
pub const LINK_PATH: &str = "/usr/local/bin/td";

/// 링크 자리의 상태.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkState {
    /// 아무것도 없다.
    Absent,
    /// 이 앱 실행 파일을 가리키는 우리 링크다.
    Ours,
    /// 다른 프로그램의 `td`(다른 곳을 가리키는 링크이거나 일반 파일)다. 건드리지 않는다.
    Foreign,
}

/// 설치·제거를 한 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Installed,
    AlreadyInstalled,
    Removed,
    NotInstalled,
}

/// 작은따옴표로 감싼 셸 인수. 안의 작은따옴표는 `'\''`로 닫고 이스케이프하고 다시 연다.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// AppleScript 문자열 리터럴 안에 넣을 글: 백슬래시와 큰따옴표를 이스케이프한다.
pub fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// 관리자 권한으로 실행할 설치 명령(고정된 두 동작: 폴더 만들기, 링크 만들기). 경로는 앱이 계산한 값만 들어간다.
pub fn install_shell(exe: &Path, link: &Path) -> String {
    let dir = link.parent().unwrap_or(Path::new("/"));
    format!(
        "mkdir -p {} && ln -sfn {} {}",
        shell_quote(&dir.to_string_lossy()),
        shell_quote(&exe.to_string_lossy()),
        shell_quote(&link.to_string_lossy())
    )
}

/// 관리자 권한으로 실행할 제거 명령(링크 하나 지우기).
pub fn uninstall_shell(link: &Path) -> String {
    format!("rm {}", shell_quote(&link.to_string_lossy()))
}

/// `osascript`에 줄 인수: 셸 명령을 관리자 권한으로 실행하는 AppleScript.
pub fn osascript_args(shell: &str) -> Vec<String> {
    vec![
        "-e".to_string(),
        format!(
            "do shell script \"{}\" with administrator privileges",
            applescript_escape(shell)
        ),
    ]
}

/// `link`가 어떤 상태인지: 없음, 이 앱 실행 파일 `exe`를 가리키는 우리 링크, 그 밖(남의 것).
pub fn classify_link(link: &Path, exe: &Path) -> LinkState {
    let Ok(meta) = std::fs::symlink_metadata(link) else {
        return LinkState::Absent;
    };
    if !meta.file_type().is_symlink() {
        return LinkState::Foreign;
    }
    let Ok(target) = std::fs::read_link(link) else {
        return LinkState::Foreign;
    };
    // 상대 링크는 링크가 든 폴더 기준이다.
    let target = if target.is_absolute() {
        target
    } else {
        link.parent().unwrap_or(Path::new("/")).join(target)
    };
    let same = |a: &Path, b: &Path| match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    };
    if same(&target, exe) {
        LinkState::Ours
    } else {
        LinkState::Foreign
    }
}

/// 사용자 PATH(`;`로 이은 글)에 `dir`를 더한 새 값. 이미 있으면(대소문자·끝의 `\` 무시) `None`.
pub fn path_add(existing: &str, dir: &str) -> Option<String> {
    let entries: Vec<&str> = existing.split(';').filter(|e| !e.is_empty()).collect();
    if entries.iter().any(|e| same_dir(e, dir)) {
        return None;
    }
    let mut out: Vec<&str> = entries;
    out.push(dir);
    Some(out.join(";"))
}

fn same_dir(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.trim_end_matches(['\\', '/']).to_lowercase();
    norm(a) == norm(b)
}

/// 사용자 PATH에서 `dir` 항목만 뺀 새 값. 없었으면 `None`.
pub fn path_remove(existing: &str, dir: &str) -> Option<String> {
    let entries: Vec<&str> = existing.split(';').filter(|e| !e.is_empty()).collect();
    if !entries.iter().any(|e| same_dir(e, dir)) {
        return None;
    }
    Some(
        entries
            .into_iter()
            .filter(|e| !same_dir(e, dir))
            .collect::<Vec<_>>()
            .join(";"),
    )
}

/// Windows `td.cmd`의 내용: 앱을 `start`로 띄워 배치 파일이 앱을 기다리지 않게 한다.
pub fn td_cmd_content(exe_name: &str) -> String {
    format!("@echo off\r\nstart \"\" \"%~dp0{exe_name}\" %*\r\n")
}

/// `td` 설치 상태(화면의 확인 창·알림이 따른다).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    /// 설치되어 있지 않다.
    Absent,
    /// 설치되어 있다.
    Installed,
    /// 다른 프로그램의 `td`가 있어 우리가 덮어쓰지 않는다(macOS).
    Foreign,
    /// 이 운영체제에서는 설치를 지원하지 않는다.
    Unsupported,
}

/// 설치 상태와, 링크(macOS) 또는 `td.cmd`(Windows)의 위치.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Status {
    pub state: State,
    pub link: String,
}

/// 링크를 `link`에 만든다. 이미 우리 링크면 그대로 두고, 남의 `td`면 덮어쓰지 않고 오류로 끝난다.
/// 권한이 모자라거나 폴더가 없어 만들지 못하면 `admin`(관리자 권한으로 셸 명령을 실행)으로 같은 일을 한다.
#[cfg(unix)]
pub fn install_at(
    exe: &Path,
    link: &Path,
    admin: &dyn Fn(&str) -> Result<(), String>,
) -> Result<Outcome, String> {
    match classify_link(link, exe) {
        LinkState::Ours => return Ok(Outcome::AlreadyInstalled),
        LinkState::Foreign => {
            return Err(format!(
                "다른 td가 이미 있어 덮어쓰지 않습니다: {}",
                link.display()
            ))
        }
        LinkState::Absent => {}
    }
    match std::os::unix::fs::symlink(exe, link) {
        Ok(()) => Ok(Outcome::Installed),
        Err(e)
            if matches!(
                e.kind(),
                std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::NotFound
            ) =>
        {
            admin(&install_shell(exe, link))?;
            match classify_link(link, exe) {
                LinkState::Ours => Ok(Outcome::Installed),
                _ => Err(format!("링크를 만들지 못했습니다: {}", link.display())),
            }
        }
        Err(e) => Err(format!("링크를 만들지 못했습니다: {e}")),
    }
}

/// `link`가 이 앱의 링크일 때만 지운다. 남의 것이면 지우지 않고 오류로 끝난다.
#[cfg(unix)]
pub fn uninstall_at(
    exe: &Path,
    link: &Path,
    admin: &dyn Fn(&str) -> Result<(), String>,
) -> Result<Outcome, String> {
    match classify_link(link, exe) {
        LinkState::Absent => Ok(Outcome::NotInstalled),
        LinkState::Foreign => Err(format!("다른 td라서 지우지 않습니다: {}", link.display())),
        LinkState::Ours => match std::fs::remove_file(link) {
            Ok(()) => Ok(Outcome::Removed),
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                admin(&uninstall_shell(link))?;
                match classify_link(link, exe) {
                    LinkState::Absent => Ok(Outcome::Removed),
                    _ => Err(format!("링크를 지우지 못했습니다: {}", link.display())),
                }
            }
            Err(e) => Err(format!("링크를 지우지 못했습니다: {e}")),
        },
    }
}

/// macOS 관리자 암호 창(`osascript`)으로 셸 명령을 실행한다. 사용자가 취소하면 오류다.
#[cfg(target_os = "macos")]
fn run_admin(shell: &str) -> Result<(), String> {
    let out = std::process::Command::new("/usr/bin/osascript")
        .args(osascript_args(shell))
        .output()
        .map_err(|e| format!("osascript를 실행하지 못했습니다: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let msg = String::from_utf8_lossy(&out.stderr);
    if msg.contains("-128") {
        return Err("관리자 암호 입력을 취소했습니다".to_string());
    }
    Err(format!("관리자 권한 실행에 실패했습니다: {}", msg.trim()))
}

/// 현재 설치 상태. `exe`는 이 앱의 실행 파일이다.
pub fn status(exe: &Path) -> Status {
    #[cfg(target_os = "macos")]
    {
        let link = Path::new(LINK_PATH);
        let state = match classify_link(link, exe) {
            LinkState::Absent => State::Absent,
            LinkState::Ours => State::Installed,
            LinkState::Foreign => State::Foreign,
        };
        Status {
            state,
            link: LINK_PATH.to_string(),
        }
    }
    #[cfg(windows)]
    {
        windows_impl::status(exe)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = exe;
        Status {
            state: State::Unsupported,
            link: String::new(),
        }
    }
}

/// `td` 명령을 설치한다(macOS: `/usr/local/bin/td` 링크, Windows: `td.cmd`와 사용자 PATH).
pub fn install(exe: &Path) -> Result<Outcome, String> {
    #[cfg(target_os = "macos")]
    {
        install_at(exe, Path::new(LINK_PATH), &run_admin)
    }
    #[cfg(windows)]
    {
        windows_impl::install(exe)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = exe;
        Err("이 운영체제에서는 명령줄 도구 설치를 지원하지 않습니다".to_string())
    }
}

/// `td` 명령을 제거한다. 우리가 만든 것만 지운다.
pub fn uninstall(exe: &Path) -> Result<Outcome, String> {
    #[cfg(target_os = "macos")]
    {
        uninstall_at(exe, Path::new(LINK_PATH), &run_admin)
    }
    #[cfg(windows)]
    {
        windows_impl::uninstall(exe)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = exe;
        Err("이 운영체제에서는 명령줄 도구 설치를 지원하지 않습니다".to_string())
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use windows::core::w;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS, LPARAM, WPARAM};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_READ, KEY_SET_VALUE, REG_EXPAND_SZ, REG_SZ, REG_VALUE_TYPE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    fn app_dir(exe: &Path) -> Result<&Path, String> {
        exe.parent()
            .ok_or_else(|| "앱 폴더를 알 수 없습니다".to_string())
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// 사용자 PATH(`HKCU\Environment`의 `Path`)와 그 값의 종류. 값이 없으면 빈 글.
    fn read_user_path() -> Result<(String, REG_VALUE_TYPE), String> {
        unsafe {
            let mut key = HKEY::default();
            let r = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                w!("Environment"),
                None,
                KEY_READ,
                &mut key,
            );
            if r != ERROR_SUCCESS {
                return Err(format!("레지스트리를 열지 못했습니다: {}", r.0));
            }
            let mut ty = REG_VALUE_TYPE::default();
            let mut len = 0u32;
            let probe =
                RegQueryValueExW(key, w!("Path"), None, Some(&mut ty), None, Some(&mut len));
            if probe == ERROR_FILE_NOT_FOUND {
                let _ = RegCloseKey(key);
                return Ok((String::new(), REG_EXPAND_SZ));
            }
            if probe != ERROR_SUCCESS {
                let _ = RegCloseKey(key);
                return Err(format!("사용자 PATH를 읽지 못했습니다: {}", probe.0));
            }
            let mut buf = vec![0u8; len as usize];
            let r = RegQueryValueExW(
                key,
                w!("Path"),
                None,
                Some(&mut ty),
                Some(buf.as_mut_ptr()),
                Some(&mut len),
            );
            let _ = RegCloseKey(key);
            if r != ERROR_SUCCESS {
                return Err(format!("사용자 PATH를 읽지 못했습니다: {}", r.0));
            }
            let units: Vec<u16> = buf[..len as usize]
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            let text = String::from_utf16_lossy(&units);
            Ok((
                text.trim_end_matches('\0').to_string(),
                if ty == REG_SZ { REG_SZ } else { REG_EXPAND_SZ },
            ))
        }
    }

    fn write_user_path(value: &str, ty: REG_VALUE_TYPE) -> Result<(), String> {
        unsafe {
            let mut key = HKEY::default();
            let r = RegOpenKeyExW(
                HKEY_CURRENT_USER,
                w!("Environment"),
                None,
                KEY_SET_VALUE,
                &mut key,
            );
            if r != ERROR_SUCCESS {
                return Err(format!("레지스트리를 열지 못했습니다: {}", r.0));
            }
            let data: Vec<u8> = wide(value).iter().flat_map(|u| u.to_le_bytes()).collect();
            let r = RegSetValueExW(key, w!("Path"), None, ty, Some(&data));
            let _ = RegCloseKey(key);
            if r != ERROR_SUCCESS {
                return Err(format!("사용자 PATH를 쓰지 못했습니다: {}", r.0));
            }
            Ok(())
        }
    }

    /// 환경 변수가 바뀌었다고 알려, 새로 여는 터미널이 바뀐 PATH를 보게 한다.
    fn broadcast() {
        unsafe {
            let env = wide("Environment");
            let _ = SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                WPARAM(0),
                LPARAM(env.as_ptr() as isize),
                SMTO_ABORTIFHUNG,
                2000,
                None,
            );
        }
    }

    pub fn status(exe: &Path) -> Status {
        let cmd = app_dir(exe).map(|d| d.join("td.cmd")).unwrap_or_default();
        let on_path = app_dir(exe)
            .ok()
            .zip(read_user_path().ok())
            .is_some_and(|(d, (p, _))| path_add(&p, &d.to_string_lossy()).is_none());
        let state = if on_path && cmd.exists() {
            State::Installed
        } else {
            State::Absent
        };
        Status {
            state,
            link: cmd.to_string_lossy().into_owned(),
        }
    }

    pub fn install(exe: &Path) -> Result<Outcome, String> {
        let dir = app_dir(exe)?;
        let name = exe
            .file_name()
            .ok_or("실행 파일 이름을 알 수 없습니다")?
            .to_string_lossy()
            .into_owned();
        let cmd = dir.join("td.cmd");
        let content = td_cmd_content(&name);
        let wrote = if std::fs::read_to_string(&cmd).ok().as_deref() == Some(content.as_str()) {
            false
        } else {
            std::fs::write(&cmd, &content).map_err(|e| format!("td.cmd를 쓰지 못했습니다: {e}"))?;
            true
        };
        let (path, ty) = read_user_path()?;
        match path_add(&path, &dir.to_string_lossy()) {
            None if !wrote => Ok(Outcome::AlreadyInstalled),
            None => Ok(Outcome::Installed),
            Some(new) => {
                write_user_path(&new, ty)?;
                broadcast();
                Ok(Outcome::Installed)
            }
        }
    }

    pub fn uninstall(exe: &Path) -> Result<Outcome, String> {
        let dir = app_dir(exe)?;
        let (path, ty) = read_user_path()?;
        let removed_path = match path_remove(&path, &dir.to_string_lossy()) {
            Some(new) => {
                write_user_path(&new, ty)?;
                broadcast();
                true
            }
            None => false,
        };
        // 우리가 쓴 td.cmd일 때만 지운다.
        let cmd = dir.join("td.cmd");
        let name = exe
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let removed_cmd = std::fs::read_to_string(&cmd).ok().as_deref()
            == Some(td_cmd_content(&name).as_str())
            && std::fs::remove_file(&cmd).is_ok();
        Ok(if removed_path || removed_cmd {
            Outcome::Removed
        } else {
            Outcome::NotInstalled
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn shell_quote_wraps_and_escapes_single_quotes() {
        assert_eq!(
            shell_quote("/Applications/Twin Deck.app/x"),
            "'/Applications/Twin Deck.app/x'"
        );
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
        assert_eq!(shell_quote("a$b`c\"d"), "'a$b`c\"d'"); // 작은따옴표 안에서는 다른 글자가 해석되지 않는다
    }

    #[test]
    fn applescript_escape_handles_backslash_and_quotes() {
        assert_eq!(applescript_escape(r#"a"b\c"#), r#"a\"b\\c"#);
        assert_eq!(applescript_escape("plain"), "plain");
    }

    #[test]
    fn install_and_uninstall_shell_are_the_two_fixed_commands() {
        let exe = Path::new("/Applications/Twin Deck.app/Contents/MacOS/twin-deck-desktop");
        let link = Path::new("/usr/local/bin/td");
        assert_eq!(
            install_shell(exe, link),
            "mkdir -p '/usr/local/bin' && ln -sfn '/Applications/Twin Deck.app/Contents/MacOS/twin-deck-desktop' '/usr/local/bin/td'"
        );
        assert_eq!(uninstall_shell(link), "rm '/usr/local/bin/td'");
        // 경로에 작은따옴표가 있어도 명령이 깨지지 않는다
        let odd = Path::new("/Users/o'neil/app");
        assert!(install_shell(odd, link).contains(r"'/Users/o'\''neil/app'"));
    }

    #[test]
    fn osascript_args_run_the_shell_with_administrator_privileges() {
        let a = osascript_args(r#"rm "x""#);
        assert_eq!(a[0], "-e");
        assert_eq!(
            a[1],
            r#"do shell script "rm \"x\"" with administrator privileges"#
        );
        assert_eq!(a.len(), 2);
    }

    /// 만든 AppleScript가 문법에 맞는지 실행하지 않고 컴파일만 해 본다(작은따옴표·큰따옴표·백슬래시가 든 경로 포함).
    #[cfg(target_os = "macos")]
    #[test]
    fn generated_applescript_compiles() {
        let t = tempfile::tempdir().unwrap();
        for exe in [
            "/Applications/Twin Deck.app/Contents/MacOS/twin-deck-desktop",
            r#"/Users/o'neil/"x"\y/app"#,
        ] {
            let shell = install_shell(Path::new(exe), Path::new(LINK_PATH));
            let args = osascript_args(&shell);
            let out = std::process::Command::new("/usr/bin/osacompile")
                .arg("-o")
                .arg(t.path().join("x.scpt"))
                .args(&args)
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "{exe}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        }
        let rm = osascript_args(&uninstall_shell(Path::new(LINK_PATH)));
        let out = std::process::Command::new("/usr/bin/osacompile")
            .arg("-o")
            .arg(t.path().join("y.scpt"))
            .args(&rm)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    #[cfg(unix)]
    fn link_to(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn classify_link_tells_absent_ours_and_foreign() {
        let t = tempfile::tempdir().unwrap();
        let exe = t.path().join("twin-deck-desktop");
        std::fs::write(&exe, "x").unwrap();
        let other = t.path().join("other");
        std::fs::write(&other, "y").unwrap();
        let link = t.path().join("td");
        assert_eq!(classify_link(&link, &exe), LinkState::Absent);
        link_to(&exe, &link);
        assert_eq!(classify_link(&link, &exe), LinkState::Ours);
        std::fs::remove_file(&link).unwrap();
        link_to(&other, &link);
        assert_eq!(classify_link(&link, &exe), LinkState::Foreign);
        std::fs::remove_file(&link).unwrap();
        std::fs::write(&link, "not a link").unwrap(); // 일반 파일
        assert_eq!(classify_link(&link, &exe), LinkState::Foreign);
        std::fs::remove_file(&link).unwrap();
        link_to(&t.path().join("gone"), &link); // 끊어진 링크, 우리 것이 아님
        assert_eq!(classify_link(&link, &exe), LinkState::Foreign);
        let _: PathBuf = link;
    }

    #[cfg(unix)]
    #[test]
    fn a_relative_symlink_to_our_exe_is_ours() {
        let t = tempfile::tempdir().unwrap();
        let exe = t.path().join("app");
        std::fs::write(&exe, "x").unwrap();
        let link = t.path().join("td");
        link_to(Path::new("app"), &link);
        assert_eq!(classify_link(&link, &exe), LinkState::Ours);
    }

    #[test]
    fn path_add_appends_once_ignoring_case_and_trailing_separator() {
        assert_eq!(path_add("", r"C:\App"), Some(r"C:\App".to_string()));
        assert_eq!(
            path_add(r"C:\A;C:\B", r"C:\App"),
            Some(r"C:\A;C:\B;C:\App".to_string())
        );
        assert_eq!(path_add(r"C:\A;C:\App", r"C:\App"), None);
        assert_eq!(path_add(r"C:\A;c:\app\", r"C:\App"), None); // 대소문자·끝의 \ 무시
        assert_eq!(
            path_add(r"C:\A;", r"C:\App"),
            Some(r"C:\A;C:\App".to_string())
        ); // 끝 세미콜론 정리
    }

    #[test]
    fn path_remove_drops_only_that_entry() {
        assert_eq!(
            path_remove(r"C:\A;C:\App;C:\B", r"C:\App"),
            Some(r"C:\A;C:\B".to_string())
        );
        assert_eq!(
            path_remove(r"C:\APP\;C:\B", r"C:\App"),
            Some(r"C:\B".to_string())
        );
        assert_eq!(path_remove(r"C:\App", r"C:\App"), Some(String::new()));
        assert_eq!(path_remove(r"C:\A;C:\B", r"C:\App"), None);
        assert_eq!(path_remove("", r"C:\App"), None);
    }

    #[test]
    fn td_cmd_starts_the_exe_next_to_it_without_waiting() {
        let c = td_cmd_content("Twin Deck.exe");
        assert!(c.starts_with("@echo off\r\n"));
        assert!(c.contains(r#"start "" "%~dp0Twin Deck.exe" %*"#));
        assert!(c.ends_with("\r\n"));
    }

    #[cfg(unix)]
    mod exec {
        use super::*;
        use std::cell::RefCell;

        fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
            let t = tempfile::tempdir().unwrap();
            let exe = t.path().join("twin-deck-desktop");
            std::fs::write(&exe, "x").unwrap();
            let link = t.path().join("bin/td");
            std::fs::create_dir(t.path().join("bin")).unwrap();
            (t, exe, link)
        }

        #[test]
        fn install_makes_our_link_and_is_idempotent_without_admin() {
            let (_t, exe, link) = setup();
            let calls = RefCell::new(Vec::<String>::new());
            let admin = |c: &str| {
                calls.borrow_mut().push(c.to_string());
                Ok(())
            };
            assert_eq!(install_at(&exe, &link, &admin), Ok(Outcome::Installed));
            assert_eq!(classify_link(&link, &exe), LinkState::Ours);
            assert_eq!(
                install_at(&exe, &link, &admin),
                Ok(Outcome::AlreadyInstalled)
            );
            assert!(
                calls.borrow().is_empty(),
                "쓸 수 있는 폴더에서는 권한 상승이 필요 없다"
            );
        }

        #[test]
        fn install_refuses_to_overwrite_someone_elses_td() {
            let (t, exe, link) = setup();
            let other = t.path().join("treasure-data");
            std::fs::write(&other, "y").unwrap();
            std::os::unix::fs::symlink(&other, &link).unwrap();
            let calls = RefCell::new(0);
            let admin = |_: &str| {
                *calls.borrow_mut() += 1;
                Ok(())
            };
            let e = install_at(&exe, &link, &admin).unwrap_err();
            assert!(e.contains("다른 td"), "{e}");
            assert_eq!(std::fs::read_link(&link).unwrap(), other); // 그대로
            assert_eq!(*calls.borrow(), 0);
        }

        #[test]
        fn install_falls_back_to_admin_when_the_folder_is_missing() {
            let (t, exe, _) = setup();
            let link = t.path().join("missing-dir/td"); // 폴더가 없다 → 직접 만들 수 없다
            let calls = RefCell::new(Vec::<String>::new());
            let admin = |c: &str| {
                calls.borrow_mut().push(c.to_string());
                std::fs::create_dir_all(link.parent().unwrap()).map_err(|e| e.to_string())?;
                std::os::unix::fs::symlink(&exe, &link).map_err(|e| e.to_string())
            };
            assert_eq!(install_at(&exe, &link, &admin), Ok(Outcome::Installed));
            let c = calls.borrow();
            assert_eq!(c.len(), 1);
            assert_eq!(c[0], install_shell(&exe, &link)); // 고정된 설치 명령만 넘어간다
        }

        #[test]
        fn install_reports_an_admin_failure() {
            let (t, exe, _) = setup();
            let link = t.path().join("missing-dir/td");
            let admin = |_: &str| Err("사용자가 취소했습니다".to_string());
            let e = install_at(&exe, &link, &admin).unwrap_err();
            assert!(e.contains("취소"), "{e}");
        }

        #[test]
        fn uninstall_removes_only_our_link() {
            let (t, exe, link) = setup();
            let admin = |_: &str| Err("호출되면 안 된다".to_string());
            assert_eq!(uninstall_at(&exe, &link, &admin), Ok(Outcome::NotInstalled));
            std::os::unix::fs::symlink(&exe, &link).unwrap();
            assert_eq!(uninstall_at(&exe, &link, &admin), Ok(Outcome::Removed));
            assert_eq!(classify_link(&link, &exe), LinkState::Absent);
            let other = t.path().join("other");
            std::fs::write(&other, "y").unwrap();
            std::os::unix::fs::symlink(&other, &link).unwrap();
            let e = uninstall_at(&exe, &link, &admin).unwrap_err();
            assert!(e.contains("다른 td"), "{e}");
            assert!(
                std::fs::symlink_metadata(&link).is_ok(),
                "남의 링크는 지우지 않는다"
            );
        }

        #[test]
        fn uninstall_falls_back_to_admin_when_the_folder_is_read_only() {
            use std::os::unix::fs::PermissionsExt;
            let (t, exe, link) = setup();
            std::os::unix::fs::symlink(&exe, &link).unwrap();
            let dir = t.path().join("bin");
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
            let calls = RefCell::new(Vec::<String>::new());
            let admin = |c: &str| {
                calls.borrow_mut().push(c.to_string());
                std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755))
                    .map_err(|e| e.to_string())?;
                std::fs::remove_file(&link).map_err(|e| e.to_string())
            };
            let r = uninstall_at(&exe, &link, &admin);
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
            // 루트로 실행 중이면 읽기 전용 폴더에서도 지워져 권한 상승이 필요 없다
            if calls.borrow().is_empty() {
                assert_eq!(r, Ok(Outcome::Removed));
            } else {
                assert_eq!(calls.borrow()[0], uninstall_shell(&link));
                assert_eq!(r, Ok(Outcome::Removed));
            }
            assert_eq!(classify_link(&link, &exe), LinkState::Absent);
        }
    }
}
