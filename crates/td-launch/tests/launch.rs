use std::cell::RefCell;
use std::rc::Rc;

use td_launch::{editor_command, open_command, reveal_command, Command, Launch, Launcher, Os};

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
