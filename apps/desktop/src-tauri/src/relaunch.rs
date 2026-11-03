//! macOS에서 업데이트 뒤 앱을 LaunchServices(`open`)로 다시 띄우는 명령을 만든다(이슈 #137).
//!
//! tauri의 `app.restart()`는 번들 안 실행 파일을 옛 프로세스의 자식으로 바로 띄우므로,
//! 새 프로세스가 LaunchServices를 거치지 않는다. 그러면 접근 권한 확인 팝업과 다른 앱으로의 드롭이
//! 깨지는 경우가 있어(가설), 옛 프로세스가 끝나기를 기다렸다가 `open`으로 번들을 다시 연다.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// 실행 파일 경로가 `<X>.app/Contents/MacOS/<exe>` 형태이면 그 `.app` 번들 경로를 돌려준다.
pub fn app_bundle_of(exe: &Path) -> Option<PathBuf> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    let is_bundle = macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension()? == "app";
    is_bundle.then(|| bundle.to_path_buf())
}

/// `$1`(옛 pid)이 살아 있는 동안 0.1초씩, 최대 약 30초 기다린 뒤 `$2`(번들)를 `open -n`으로 연다.
/// `-n`은 다중 실행 설정에서 같은 번들의 다른 인스턴스가 떠 있어도 그것을 활성화하는 대신 새로 띄우게 한다.
/// `open`이 실패하면 예전처럼 `$3`(실행 파일)을 직접 실행한다.
/// 경로와 pid는 위치 인자로만 받으므로 따옴표·공백이 든 경로도 셸 문자열에 섞이지 않는다.
const RELAUNCH_SCRIPT: &str = "i=0; while kill -0 \"$1\" 2>/dev/null && [ \"$i\" -lt 300 ]; do sleep 0.1; i=$((i+1)); done; /usr/bin/open -n \"$2\" || exec \"$3\"";

/// 옛 pid가 끝나기를 기다린 뒤 번들을 `open`으로 여는 명령(프로그램, 인자)을 만든다.
/// `open`이 실패하면 `exe`(현재 실행 파일)를 직접 실행한다.
pub fn relaunch_command(old_pid: u32, bundle: &Path, exe: &Path) -> (PathBuf, Vec<OsString>) {
    let args = vec![
        "-c".into(),
        RELAUNCH_SCRIPT.into(),
        "sh".into(),
        old_pid.to_string().into(),
        bundle.as_os_str().to_owned(),
        exe.as_os_str().to_owned(),
    ];
    (PathBuf::from("/bin/sh"), args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relaunch_번들_안의_실행_파일이면_번들_경로를_돌려준다() {
        let exe = Path::new("/Applications/Twin Deck.app/Contents/MacOS/twin-deck-desktop");
        assert_eq!(
            app_bundle_of(exe),
            Some(PathBuf::from("/Applications/Twin Deck.app"))
        );
    }

    #[test]
    fn relaunch_번들_밖의_실행_파일이면_none() {
        for exe in [
            "/Users/me/twin-deck/target/debug/twin-deck-desktop",
            "/Applications/Twin Deck/Contents/MacOS/twin-deck-desktop",
            "/Applications/Twin Deck.app/Contents/Resources/twin-deck-desktop",
            "/Applications/Twin Deck.app/MacOS/twin-deck-desktop",
            "twin-deck-desktop",
        ] {
            assert_eq!(app_bundle_of(Path::new(exe)), None, "{exe}");
        }
    }

    const BUNDLE: &str = "/Applications/Twin Deck.app";
    const EXE: &str = "/Applications/Twin Deck.app/Contents/MacOS/twin-deck-desktop";

    #[test]
    fn relaunch_명령은_sh로_pid를_기다린_뒤_open_n으로_열고_실패하면_실행_파일을_띄운다() {
        let (program, args) = relaunch_command(4242, Path::new(BUNDLE), Path::new(EXE));
        assert_eq!(program, PathBuf::from("/bin/sh"));
        assert_eq!(args.len(), 6);
        assert_eq!(args[0], "-c");
        let script = args[1].to_str().unwrap();
        assert!(script.contains("kill -0 \"$1\""), "{script}");
        assert!(
            script.contains("/usr/bin/open -n \"$2\" || exec \"$3\""),
            "{script}"
        );
        assert_eq!(args[2], "sh");
        assert_eq!(args[3], "4242");
        assert_eq!(args[4], BUNDLE);
        assert_eq!(args[5], EXE);
    }

    #[test]
    fn relaunch_특수문자_경로도_스크립트에_끼워_넣지_않고_인자로_넘긴다() {
        let bundle = Path::new("/Users/나/앱 폴더/it's Twin Deck.app");
        let exe = bundle.join("Contents/MacOS/it's \"exe\"");
        let (_, args) = relaunch_command(7, bundle, &exe);
        let script = args[1].to_str().unwrap();
        for part in ["앱 폴더", "it's", "Twin Deck", "exe\""] {
            assert!(!script.contains(part), "{part}: {script}");
        }
        assert_eq!(args[3], "7");
        assert_eq!(args[4], bundle.as_os_str());
        assert_eq!(args[5], exe.as_os_str());
        // 같은 스크립트를 쓰므로 경로가 달라도 스크립트 문자열은 바뀌지 않는다.
        let (_, other) = relaunch_command(7, Path::new(BUNDLE), Path::new(EXE));
        assert_eq!(args[1], other[1]);
    }

    /// 스크립트의 `open -n`을 `opener`로 바꿔 실제 `/bin/sh`로 돌리고, 대체 실행 파일로 `/bin/pwd`를 넘겨
    /// 그 출력(작업 폴더 `/`)이 나오는지로 대체 경로가 실행됐는지 본다. 옛 pid는 이미 끝난 자식이다.
    fn run_with_opener(opener: &str) -> String {
        let mut done = std::process::Command::new("/usr/bin/true").spawn().unwrap();
        done.wait().unwrap();
        let (program, mut args) =
            relaunch_command(done.id(), Path::new(BUNDLE), Path::new("/bin/pwd"));
        let script = args[1]
            .to_str()
            .unwrap()
            .replace("/usr/bin/open -n", opener);
        assert_ne!(script, args[1].to_str().unwrap(), "치환할 open -n이 없다");
        args[1] = script.into();
        let out = std::process::Command::new(program)
            .args(args)
            .current_dir("/")
            .output()
            .unwrap();
        String::from_utf8(out.stdout).unwrap()
    }

    #[test]
    fn relaunch_open이_실패하면_실행_파일을_직접_띄운다() {
        assert_eq!(run_with_opener("/usr/bin/false"), "/\n");
    }

    #[test]
    fn relaunch_open이_성공하면_실행_파일을_띄우지_않는다() {
        assert_eq!(run_with_opener("/usr/bin/true"), "");
    }
}
