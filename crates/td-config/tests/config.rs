use std::fs;
use std::time::Duration;

use td_config::{load_dir, load_from_strs, ConfigStore, Platform};

fn load(config: &str) -> td_config::Loaded {
    load_from_strs(Some(config), None, Platform::Linux)
}

#[test]
fn config_merge_precedence() {
    // 기본값
    let none = load_from_strs(None, None, Platform::Linux);
    assert!(none.warnings.is_empty());
    assert!(none.config.behavior.layout.show_action_bar);
    assert!(none.config.core.confirm.delete);

    // 사용자 값이 기본값을 덮고, 건드리지 않은 키는 기본값을 유지한다(테이블 깊은 병합)
    let l = load("[core.confirm]\ntrash = true\n[behavior.table]\ncircular_selection = true\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.core.confirm.trash);
    assert!(
        l.config.core.confirm.delete,
        "건드리지 않은 delete는 기본값"
    );
    assert!(l.config.behavior.table.circular_selection);
    assert_eq!(l.config.behavior.table.icon_size, 16);

    // 배열은 통째로 교체
    let l = load("[view.table]\ncolumns = [\">extension:50\", \"name\"]\n");
    assert_eq!(l.config.view.table.columns, [">extension:50", "name"]);

    // 즐겨찾기(구분선/그룹 포함)
    let l = load(
        r#"
[[favorites]]
name = "Downloads"
path = "${user.downloads}"

[[favorites]]
type = "separator"

[[favorites]]
type = "group"
name = "Work"
items = [ { name = "Projects", path = "~/workspace" } ]
"#,
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.favorites.len(), 3);
    assert_eq!(
        l.config.favorites[0].path.as_deref(),
        Some("${user.downloads}")
    );
    assert_eq!(l.config.favorites[1].kind, "separator");
    assert_eq!(l.config.favorites[2].items[0].name, "Projects");

    // 키바인딩: 공통 < OS별 섹션 (현재 OS만 적용)
    let kb = r#"
[keybindings]
"F5" = "core.copy"
"Alt+H" = { id = "core.open.directory", src = "~" }

[keybindings.linux]
"F5" = "core.move"

[keybindings.windows]
"Ctrl+Shift+C" = "core.path.copy_files"
"#;
    let l = load_from_strs(None, Some(kb), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    let keys: Vec<_> = l
        .bindings
        .iter()
        .map(|b| (b.key.as_str(), b.action.as_deref()))
        .collect();
    assert_eq!(
        keys,
        [
            ("Alt+H", Some("core.open.directory")),
            ("F5", Some("core.copy")),
            ("F5", Some("core.move"))
        ],
        "공통 항목 뒤에 OS 섹션이 오고, 다른 OS 섹션은 무시된다"
    );
    assert_eq!(l.bindings[0].args.get("src").map(String::as_str), Some("~"));
    let mac = load_from_strs(None, Some(kb), Platform::Mac);
    assert_eq!(mac.bindings.len(), 2);
}

#[test]
fn config_invalid_keeps_running() {
    // 깨진 TOML: 패닉 없이 기본값 + 줄 번호가 있는 경고
    let l = load("[behavior\ntheme = ");
    assert!(l.config.core.confirm.delete);
    assert_eq!(l.warnings.len(), 1);
    assert_eq!(l.warnings[0].file, "config.toml");
    assert!(l.warnings[0].line.is_some());

    // 타입 오류, 알 수 없는 키, 허용되지 않는 값은 항목별로 경고하고 나머지는 적용
    let l = load(
        r#"
mystery = 1
[behavior.table]
icon_size = "big"
circular_selection = true
[behavior.selection]
shift_mode = "sideways"
[display]
size_format = "parsecs"
unknown_key = true
[layout]
action_bar = [1, 2]
[core.confirm]
delete = false
"#,
    );
    let msgs: Vec<_> = l.warnings.iter().map(|w| w.message.as_str()).collect();
    assert!(msgs.iter().any(|m| m.contains("mystery")), "{msgs:?}");
    assert!(msgs.iter().any(|m| m.contains("icon_size")), "{msgs:?}");
    assert!(msgs.iter().any(|m| m.contains("shift_mode")), "{msgs:?}");
    assert!(msgs.iter().any(|m| m.contains("size_format")), "{msgs:?}");
    assert!(
        msgs.iter().any(|m| m.contains("display.unknown_key")),
        "{msgs:?}"
    );
    assert!(
        msgs.iter().any(|m| m.contains("layout.action_bar")),
        "{msgs:?}"
    );
    assert_eq!(l.config.behavior.table.icon_size, 16, "잘못된 값은 기본값");
    assert_eq!(l.config.behavior.selection.shift_mode, "invert");
    assert_eq!(l.config.display.size_format, "adaptive");
    assert!(
        l.config.behavior.table.circular_selection,
        "올바른 값은 그대로 적용"
    );
    assert!(!l.config.core.confirm.delete);

    // 잘못된 즐겨찾기 항목은 빠지고 경고
    let l = load("[[favorites]]\nname = \"x\"\n\n[[favorites]]\ntype = \"weird\"\n\n[[favorites]]\nname = \"ok\"\npath = \"/tmp\"\n");
    assert_eq!(l.config.favorites.len(), 1);
    assert_eq!(l.warnings.len(), 2);

    // 키바인딩 파일이 깨져도 설정은 산다
    let l = load_from_strs(None, Some("[keybindings\n"), Platform::Linux);
    assert!(l.bindings.is_empty());
    assert_eq!(l.warnings[0].file, "keybindings.toml");
    let l = load_from_strs(
        None,
        Some("[keybindings]\n\"F5\" = 3\n\"F6\" = { src = \"x\" }\n"),
        Platform::Linux,
    );
    assert!(l.bindings.is_empty());
    assert_eq!(l.warnings.len(), 2);
}

#[test]
fn keybinding_unbind_none() {
    let l = load_from_strs(
        None,
        Some("[keybindings]\n\"F5\" = \"none\"\n\"F8\" = \"core.trash\"\n"),
        Platform::Linux,
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    let f5 = l.bindings.iter().find(|b| b.key == "F5").unwrap();
    assert_eq!(f5.action, None, "\"none\"은 기본 바인딩 해제를 뜻한다");
    let f8 = l.bindings.iter().find(|b| b.key == "F8").unwrap();
    assert_eq!(f8.action.as_deref(), Some("core.trash"));
}

#[test]
fn config_watch_reload() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("config.toml"),
        "[core.confirm]\ntrash = false\n",
    )
    .unwrap();
    let (store, rx) = ConfigStore::start(dir.path(), Platform::Linux).unwrap();
    assert!(!store.current().config.core.confirm.trash);
    std::thread::sleep(Duration::from_millis(400));
    while rx.try_recv().is_ok() {}

    // 파일을 고치면 재로딩된다
    fs::write(
        dir.path().join("config.toml"),
        "[core.confirm]\ntrash = true\n",
    )
    .unwrap();
    let loaded = loop {
        let l = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("재로딩 이벤트");
        if l.config.core.confirm.trash {
            break l;
        }
    };
    assert!(loaded.warnings.is_empty());
    assert!(store.current().config.core.confirm.trash);

    // 문법 오류: 이전 유효 설정을 유지하고 경고만 남긴다
    std::thread::sleep(Duration::from_millis(400));
    while rx.try_recv().is_ok() {}
    fs::write(dir.path().join("config.toml"), "[core.confirm\ntrash = ").unwrap();
    let broken = loop {
        let l = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("재로딩 이벤트");
        if !l.warnings.is_empty() {
            break l;
        }
    };
    assert!(broken.config.core.confirm.trash, "이전 유효 값 유지");
    assert!(broken.warnings[0].line.is_some());

    // 키바인딩 파일이 새로 생겨도 반영된다
    std::thread::sleep(Duration::from_millis(400));
    while rx.try_recv().is_ok() {}
    fs::write(dir.path().join("config.toml"), "").unwrap();
    fs::write(
        dir.path().join("keybindings.toml"),
        "[keybindings]\n\"F5\" = \"none\"\n",
    )
    .unwrap();
    loop {
        let l = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("재로딩 이벤트");
        if l.bindings.len() == 1 && l.warnings.is_empty() {
            break;
        }
    }
    assert_eq!(load_dir(dir.path(), Platform::Linux).bindings.len(), 1);
}
