use std::cell::RefCell;
use std::rc::Rc;

use td_launch::{
    app_command, editor_command, open_command, reveal_command, run_wait, Command, Launch, Launcher,
    Os,
};

fn cmd(program: &str, args: &[&str]) -> Command {
    Command {
        program: program.into(),
        args: args.iter().map(|s| s.to_string()).collect(),
    }
}

#[test]
fn launch_reveal_args() {
    assert_eq!(
        reveal_command(Os::Mac, "/Users/me/a b.txt", false),
        cmd("open", &["-R", "/Users/me/a b.txt"])
    );
    assert_eq!(
        reveal_command(Os::Mac, "/Users/me/dir", true),
        cmd("open", &["/Users/me/dir"])
    );
    assert_eq!(
        reveal_command(Os::Windows, "C:\\x\\a.txt", false),
        cmd("explorer", &["/select,C:\\x\\a.txt"])
    );
    assert_eq!(
        reveal_command(Os::Windows, "C:\\x", true),
        cmd("explorer", &["C:\\x"])
    );
    assert_eq!(
        reveal_command(Os::Linux, "/home/me/a.txt", false),
        cmd("xdg-open", &["/home/me"])
    );
    assert_eq!(
        reveal_command(Os::Linux, "/a.txt", false),
        cmd("xdg-open", &["/"])
    );
    assert_eq!(
        reveal_command(Os::Linux, "/home/me/dir", true),
        cmd("xdg-open", &["/home/me/dir"])
    );
    // 셸 메타문자가 든 이름도 인수 하나로 그대로 전달된다
    assert_eq!(
        reveal_command(Os::Linux, "/tmp/a; rm -rf ~/x.txt", false).args,
        ["/tmp/a; rm -rf ~"],
        "부모 경로가 한 인수로 그대로 전달된다(셸 해석 없음)"
    );
    assert_eq!(
        reveal_command(Os::Mac, "/tmp/$(id).txt", false).args,
        ["-R", "/tmp/$(id).txt"]
    );
}

#[test]
fn launch_editor_args() {
    let paths = vec!["/p/a b.txt".to_string(), "/p/c.txt".to_string()];
    // macOS: 앱 이름은 open -a
    assert_eq!(
        editor_command(Os::Mac, "Visual Studio Code", &paths).unwrap(),
        cmd(
            "open",
            &["-a", "Visual Studio Code", "/p/a b.txt", "/p/c.txt"]
        )
    );
    // 실행 파일 경로나 이름은 그대로 실행
    assert_eq!(
        editor_command(Os::Mac, "/usr/local/bin/code", &paths)
            .unwrap()
            .program,
        "/usr/local/bin/code"
    );
    assert_eq!(
        editor_command(Os::Linux, "code", &paths).unwrap(),
        cmd("code", &["/p/a b.txt", "/p/c.txt"])
    );
    assert_eq!(
        editor_command(Os::Windows, "notepad.exe", &paths)
            .unwrap()
            .program,
        "notepad.exe"
    );
    // 오류
    assert!(editor_command(Os::Linux, "  ", &paths).is_err());
    assert!(editor_command(Os::Linux, "code", &[]).is_err());
}

struct Recorder(Rc<RefCell<Vec<Command>>>);
impl Launcher for Recorder {
    fn run(&self, c: &Command) -> Result<(), String> {
        self.0.borrow_mut().push(c.clone());
        Ok(())
    }
}

#[test]
fn launch_facade_passes_commands_to_the_launcher() {
    let log = Rc::new(RefCell::new(Vec::new()));
    let launch = Launch::new(Recorder(log.clone()), Os::Linux);
    launch.reveal("/home/me/a.txt", false).unwrap();
    launch
        .edit("code", &["/home/me/a.txt".to_string()])
        .unwrap();
    assert!(launch.edit("", &["/x".to_string()]).is_err());
    assert_eq!(
        *log.borrow(),
        [
            cmd("xdg-open", &["/home/me"]),
            cmd("code", &["/home/me/a.txt"])
        ],
        "오류인 요청은 실행기까지 가지 않는다"
    );
}

#[test]
fn launch_open_args() {
    assert_eq!(
        open_command(Os::Mac, "/Users/me/a b.txt"),
        cmd("open", &["/Users/me/a b.txt"])
    );
    assert_eq!(
        open_command(Os::Windows, "C:\\x\\a.txt"),
        cmd("explorer", &["C:\\x\\a.txt"])
    );
    assert_eq!(
        open_command(Os::Linux, "/tmp/a; rm -rf ~/x.txt"),
        cmd("xdg-open", &["/tmp/a; rm -rf ~/x.txt"]),
        "셸 메타문자가 든 이름도 인수 하나로 그대로 전달된다"
    );
}

#[test]
fn launch_app_mac_bundle() {
    let paths = vec!["/p/a b.txt".to_string(), "/p/c".to_string()];
    // .app 번들 경로와 앱 이름은 open -a (이름에 점이 있어도 번들이면 같다)
    assert_eq!(
        app_command(Os::Mac, "/Applications/Visual Studio Code.app", &paths).unwrap(),
        cmd(
            "open",
            &[
                "-a",
                "/Applications/Visual Studio Code.app",
                "/p/a b.txt",
                "/p/c"
            ]
        )
    );
    assert_eq!(
        app_command(Os::Mac, "/Applications/Foo.app/", &paths)
            .unwrap()
            .program,
        "open"
    );
    assert_eq!(
        app_command(Os::Mac, "Preview", &paths).unwrap(),
        cmd("open", &["-a", "Preview", "/p/a b.txt", "/p/c"])
    );
}

#[test]
fn launch_app_direct_exec() {
    let paths = vec!["/p/a b.txt".to_string()];
    // 실행 파일 경로와 다른 OS는 그대로 실행하고 경로는 인수 하나씩 전달된다(셸 해석 없음)
    assert_eq!(
        app_command(Os::Mac, "/usr/local/bin/code", &paths).unwrap(),
        cmd("/usr/local/bin/code", &["/p/a b.txt"])
    );
    assert_eq!(
        app_command(Os::Linux, "code", &paths).unwrap(),
        cmd("code", &["/p/a b.txt"])
    );
    assert_eq!(
        app_command(Os::Windows, "notepad.exe", &paths).unwrap(),
        cmd("notepad.exe", &["/p/a b.txt"])
    );
    // 앱이나 경로가 없으면 실행하지 않는다
    assert!(app_command(Os::Linux, "  ", &paths).is_err());
    assert!(app_command(Os::Linux, "code", &[]).is_err());
}

#[cfg(unix)]
#[test]
fn launch_app_spawns_with_paths() {
    use std::os::unix::fs::PermissionsExt;
    use std::time::{Duration, Instant};
    use td_launch::SystemLauncher;

    // 받은 인수를 한 줄씩 파일에 쓰는 임시 스크립트를 실제로 실행해, 경로가 쪼개지지 않고 그대로 가는지 본다.
    let tmp = tempfile::tempdir().unwrap();
    let out = tmp.path().join("args.txt");
    let script = tmp.path().join("app.sh");
    std::fs::write(
        &script,
        format!(
            "#!/bin/sh\nfor a in \"$@\"; do printf '%s\\n' \"$a\" >> '{}'; done\n",
            out.display()
        ),
    )
    .unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

    let paths = vec!["/p/a b.txt".to_string(), "/p/$(id); x.txt".to_string()];
    let launch = Launch::new(SystemLauncher, Os::Linux);
    launch.launch_app(script.to_str().unwrap(), &paths).unwrap();

    let deadline = Instant::now() + Duration::from_secs(5);
    let got = loop {
        if let Ok(text) = std::fs::read_to_string(&out) {
            if text.lines().count() >= paths.len() {
                break text;
            }
        }
        assert!(Instant::now() < deadline, "앱이 인수를 기록하지 않았다");
        std::thread::sleep(Duration::from_millis(20));
    };
    assert_eq!(got.lines().collect::<Vec<_>>(), paths);
}

#[test]
fn launch_app_with_extra_options() {
    let paths = vec!["C:\\x y".to_string()];
    // 이름만 있는 명령은 첫 단어가 프로그램이고 나머지는 옵션이다(터미널의 `wt -d <폴더>`)
    assert_eq!(
        app_command(Os::Windows, "wt -d", &paths).unwrap(),
        cmd("wt", &["-d", "C:\\x y"])
    );
    assert_eq!(
        app_command(Os::Linux, "wezterm start --cwd", &paths).unwrap(),
        cmd("wezterm", &["start", "--cwd", "C:\\x y"])
    );
    // 공백이 든 실행 파일 경로는 따옴표 없이도 그대로 프로그램이다
    let code = "C:\\Program Files\\Microsoft VS Code\\bin\\code";
    assert_eq!(
        app_command(Os::Windows, code, &paths).unwrap(),
        cmd(code, &["C:\\x y"])
    );
    // 경로 뒤의 첫 `-옵션`부터가 인수다
    assert_eq!(
        app_command(Os::Windows, &format!("{code} -r --new-window"), &paths).unwrap(),
        cmd(code, &["-r", "--new-window", "C:\\x y"])
    );
    // 따옴표로 감싸면 어디까지가 프로그램인지 분명하다. 인수의 따옴표도 풀린다
    assert_eq!(
        app_command(
            Os::Windows,
            "\"C:\\Program Files\\Git\\git-bash.exe\" --title \"My Term\"",
            &paths
        )
        .unwrap(),
        cmd(
            "C:\\Program Files\\Git\\git-bash.exe",
            &["--title", "My Term", "C:\\x y"]
        )
    );
    // 닫히지 않은 따옴표는 실행하지 않는다
    assert!(app_command(Os::Windows, "\"C:\\x -d", &paths).is_err());
}

#[test]
fn launch_app_mac_with_extra_options() {
    let paths = vec!["/p/a b".to_string()];
    // 공백이 든 앱 이름은 그대로 앱 이름이다
    assert_eq!(
        app_command(Os::Mac, "Visual Studio Code", &paths).unwrap(),
        cmd("open", &["-a", "Visual Studio Code", "/p/a b"])
    );
    // 옵션이 있으면 새 인스턴스로 `--args` 뒤에 옵션과 경로를 넘긴다(`open -na Alacritty --args --working-directory <폴더>`)
    assert_eq!(
        app_command(Os::Mac, "Alacritty --working-directory", &paths).unwrap(),
        cmd(
            "open",
            &[
                "-n",
                "-a",
                "Alacritty",
                "--args",
                "--working-directory",
                "/p/a b"
            ]
        )
    );
    assert_eq!(
        app_command(
            Os::Mac,
            "/Applications/Alacritty.app --working-directory",
            &paths
        )
        .unwrap(),
        cmd(
            "open",
            &[
                "-n",
                "-a",
                "/Applications/Alacritty.app",
                "--args",
                "--working-directory",
                "/p/a b"
            ]
        )
    );
    // 실행 파일 경로는 직접 실행한다
    assert_eq!(
        app_command(Os::Mac, "/usr/local/bin/code -r", &paths).unwrap(),
        cmd("/usr/local/bin/code", &["-r", "/p/a b"])
    );
}

#[test]
fn windows_program_without_extension_is_resolved() {
    use std::path::PathBuf;
    use td_launch::resolve_windows_program;

    let tmp = tempfile::tempdir().unwrap();
    let bin = tmp.path().join("VS Code").join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    // VS Code처럼 확장자 없는 쉘 스크립트와 code.cmd만 있다
    std::fs::write(bin.join("code"), "#!/bin/sh").unwrap();
    std::fs::write(bin.join("code.cmd"), "@echo off").unwrap();
    let code = bin.join("code").to_string_lossy().into_owned();
    assert_eq!(
        resolve_windows_program(&code, &[]),
        bin.join("code.cmd").to_string_lossy()
    );

    // .exe가 있으면 .exe를 우선한다
    std::fs::write(bin.join("code.exe"), "").unwrap();
    assert_eq!(
        resolve_windows_program(&code, &[]),
        bin.join("code.exe").to_string_lossy()
    );

    // 경로 없는 이름은 검색 폴더에서 찾는다
    let dirs: Vec<PathBuf> = vec![tmp.path().to_path_buf(), bin.clone()];
    assert_eq!(
        resolve_windows_program("code", &dirs),
        bin.join("code.exe").to_string_lossy()
    );

    // 확장자가 있거나 찾지 못하면 그대로 둔다
    assert_eq!(resolve_windows_program("notepad.exe", &dirs), "notepad.exe");
    assert_eq!(resolve_windows_program("nope", &dirs), "nope");
}

#[test]
fn macos_app_named_folder_is_revealed_not_opened() {
    // 이름이 .app으로 끝나는 폴더(설정 폴더 dev.twindeck.app)를 `open`에 그대로 주면 앱 번들로 보고 실행하려다 실패한다.
    let dir = "/Users/me/Library/Application Support/dev.twindeck.app";
    let expected = cmd("open", &["-R", dir]);
    assert_eq!(reveal_command(Os::Mac, dir, true), expected);
    assert_eq!(
        reveal_command(Os::Mac, &format!("{dir}/"), true),
        cmd("open", &["-R", &format!("{dir}/")])
    );
    assert_eq!(
        reveal_command(Os::Mac, "/Applications/Foo.APP", true),
        cmd("open", &["-R", "/Applications/Foo.APP"])
    );
    // 일반 폴더는 지금처럼 폴더를 연다. .app이 이름 중간에만 있어도 마찬가지다.
    assert_eq!(
        reveal_command(Os::Mac, "/Users/me/dir", true),
        cmd("open", &["/Users/me/dir"])
    );
    assert_eq!(
        reveal_command(Os::Mac, "/Users/me/my.app.d", true),
        cmd("open", &["/Users/me/my.app.d"])
    );
    // Windows·Linux는 규칙을 바꾸지 않는다.
    assert_eq!(
        reveal_command(Os::Windows, "C:\\x\\Foo.app", true),
        cmd("explorer", &["C:\\x\\Foo.app"])
    );
    assert_eq!(
        reveal_command(Os::Linux, "/home/me/Foo.app", true),
        cmd("xdg-open", &["/home/me/Foo.app"])
    );
}

#[cfg(unix)]
#[test]
fn run_wait_reports_exit_status_and_stderr() {
    let ok = run_wait("sh", &["-c".to_string(), "exit 0".to_string()]);
    assert_eq!(ok, Ok(()));
    let err = run_wait(
        "sh",
        &["-c".to_string(), "echo boom >&2; exit 3".to_string()],
    )
    .unwrap_err();
    assert!(err.contains("boom"), "stderr가 오류에 담겨야 한다: {err}");
    let silent = run_wait("sh", &["-c".to_string(), "exit 2".to_string()]).unwrap_err();
    assert!(
        silent.contains('2'),
        "stderr가 없으면 종료 코드를 알린다: {silent}"
    );
    assert!(run_wait("definitely-not-a-program-xyz", &[]).is_err());
}

// 실제 macOS의 `open`이 .app 이름 폴더를 실행하려다 실패하고, 그 실패가 Err로 올라오는지(이슈 #35의 재현).
#[cfg(target_os = "macos")]
#[test]
fn macos_open_failure_on_app_named_folder_is_reported() {
    let dir = std::env::temp_dir().join(format!("td-launch-{}.app", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let err = run_wait("open", &[dir.to_string_lossy().into_owned()]).unwrap_err();
    std::fs::remove_dir_all(&dir).ok();
    assert!(!err.is_empty());
}
