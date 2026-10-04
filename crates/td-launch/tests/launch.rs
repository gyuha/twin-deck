use std::cell::RefCell;
use std::rc::Rc;

use td_launch::{
    app_command, editor_command, open_command, reveal_command, Command, Launch, Launcher, Os,
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
