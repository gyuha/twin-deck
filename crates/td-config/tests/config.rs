use std::fs;
use std::time::Duration;

use td_config::{append_favorite, load_dir, load_from_strs, ConfigStore, Platform};

/// 파일 이벤트가 조용해질 때까지(500ms 무이벤트, 최대 10초) 비운다. 고정 sleep은 늦게 오는 이벤트에 취약하다.
fn settle(rx: &std::sync::mpsc::Receiver<td_config::Loaded>) {
    let end = std::time::Instant::now() + Duration::from_secs(10);
    while rx.recv_timeout(Duration::from_millis(500)).is_ok() && std::time::Instant::now() < end {}
}

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
    settle(&rx);

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
    settle(&rx);
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
    settle(&rx);
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

#[test]
fn favorite_append_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("config.toml");
    fs::write(&file, "# 내 설정\n[core.confirm]\ntrash = true").unwrap(); // 끝 개행 없음

    append_favorite(dir.path(), "Work \"A\"", "/home/me/work").unwrap();
    append_favorite(dir.path(), "Tmp", "C:\\temp").unwrap();
    let text = fs::read_to_string(&file).unwrap();
    assert!(
        text.starts_with("# 내 설정\n[core.confirm]\ntrash = true"),
        "기존 내용과 주석 보존"
    );
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.core.confirm.trash);
    assert_eq!(l.config.favorites.len(), 2);
    assert_eq!(l.config.favorites[0].name.as_deref(), Some("Work \"A\""));
    assert_eq!(l.config.favorites[1].path.as_deref(), Some("C:\\temp"));

    // 파일이 없어도 만들어진다
    let empty = tempfile::tempdir().unwrap();
    append_favorite(empty.path(), "Home", "~").unwrap();
    assert_eq!(
        load_dir(empty.path(), Platform::Linux)
            .config
            .favorites
            .len(),
        1
    );
}

#[test]
fn favorite_append_refuses_and_keeps_file_when_unsafe() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("config.toml");
    // 이미 인라인 배열로 정의됨 -> [[favorites]]를 덧붙이면 TOML이 깨진다
    let inline = "favorites = [ { name = \"a\", path = \"/a\" } ]\n";
    fs::write(&file, inline).unwrap();
    assert!(append_favorite(dir.path(), "x", "/x").is_err());
    assert_eq!(fs::read_to_string(&file).unwrap(), inline, "파일은 그대로");

    // 문법 오류가 있는 파일도 건드리지 않는다
    fs::write(&file, "[broken\n").unwrap();
    assert!(append_favorite(dir.path(), "x", "/x").is_err());
    assert_eq!(fs::read_to_string(&file).unwrap(), "[broken\n");
}

#[test]
fn columns_spec_parse() {
    use td_config::{parse_column, SortMarker};
    let c = parse_column("name").unwrap();
    assert_eq!((c.name.as_str(), c.sort, c.width), ("name", None, None));
    let c = parse_column(">extension:50").unwrap();
    assert_eq!(
        (c.name.as_str(), c.sort, c.width),
        ("extension", Some(SortMarker::Desc), Some(50))
    );
    let c = parse_column("<modified").unwrap();
    assert_eq!(
        (c.name.as_str(), c.sort, c.width),
        ("modified", Some(SortMarker::Asc), None)
    );
    let c = parse_column("size:120").unwrap();
    assert_eq!((c.sort, c.width), (None, Some(120)));
    for name in td_config::COLUMN_NAMES {
        assert!(parse_column(name).is_ok(), "{name}");
    }

    for bad in [
        "", "<", "colour", ">nope:5", "size:abc", "size:0", "size:-3", "size:", ":5", "<>name",
        "Name",
    ] {
        assert!(parse_column(bad).is_err(), "'{bad}'는 오류여야 한다");
    }

    // 설정 로딩: 잘못된 항목은 경고하고 빠지며 name은 항상 있다
    let l = load("[view.table]\ncolumns = [\"size\", \"colour\", \">extension:50\", \"size:x\"]\n");
    assert_eq!(
        l.config.view.table.columns,
        ["name", "size", ">extension:50"]
    );
    assert_eq!(l.warnings.len(), 2, "{:?}", l.warnings);
    assert!(l.warnings.iter().any(|w| w.message.contains("colour")));
    let l = load("[view.table]\ncolumns = []\n");
    assert_eq!(l.config.view.table.columns, ["name"]);
}

#[test]
fn theme_setting_is_validated() {
    // 아직 사용자 정의 테마(P3)는 없으므로 알 수 없는 이름은 경고하고 기본값
    let l = load("[behavior]\ntheme = \"sakura\"\n");
    assert_eq!(l.config.behavior.theme, "system");
    assert!(
        l.warnings.iter().any(|w| w.message.contains("theme")),
        "{:?}",
        l.warnings
    );
}

#[test]
fn theme_accepts_spaceui_themes() {
    assert_eq!(load("").config.behavior.theme, "system");
    for t in [
        "dark", "light", "midnight", "noir", "slate", "nord", "mocha", "system",
    ] {
        let l = load(&format!("[behavior]\ntheme = \"{t}\"\n"));
        assert!(l.warnings.is_empty(), "{t}: {:?}", l.warnings);
        assert_eq!(l.config.behavior.theme, t);
    }
}

fn user_value_dir(initial: Option<&str>) -> tempfile::TempDir {
    let d = tempfile::tempdir().unwrap();
    if let Some(s) = initial {
        fs::write(d.path().join("config.toml"), s).unwrap();
    }
    d
}

#[test]
fn user_value_set_keeps_comments_and_other_keys() {
    let d = user_value_dir(Some(
        "# 내 설정\n[behavior.table]\nicon_size = 16 # 아이콘\ncircular_selection = true\n\n[core.confirm]\ntrash = true\n",
    ));
    td_config::set_user_value(
        d.path(),
        "behavior.table.icon_size",
        td_config::ConfigValue::Int(20),
    )
    .unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(text.contains("# 내 설정"), "{text}");
    assert!(text.contains("# 아이콘"), "{text}");
    assert!(text.contains("icon_size = 20"), "{text}");
    assert!(text.contains("circular_selection = true"), "{text}");
    assert!(text.contains("trash = true"), "{text}");
    let l = load_dir(d.path(), Platform::Linux);
    assert_eq!(l.config.behavior.table.icon_size, 20);
    assert!(l.config.behavior.table.circular_selection);
}

#[test]
fn user_value_set_creates_file_and_tables_with_each_type() {
    let d = user_value_dir(None);
    use td_config::{set_user_value, ConfigValue};
    set_user_value(
        d.path(),
        "behavior.theme",
        ConfigValue::Str("midnight".into()),
    )
    .unwrap();
    set_user_value(d.path(), "core.confirm.delete", ConfigValue::Bool(false)).unwrap();
    set_user_value(d.path(), "behavior.table.icon_size", ConfigValue::Int(24)).unwrap();
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.behavior.theme, "midnight");
    assert!(!l.config.core.confirm.delete);
    assert_eq!(l.config.behavior.table.icon_size, 24);
}

#[test]
fn user_value_reset_removes_key_and_prunes_empty_tables() {
    let d = user_value_dir(Some(
        "[behavior]\ntheme = \"nord\"\n\n[core.confirm]\ndelete = false\n",
    ));
    td_config::reset_user_value(d.path(), "core.confirm.delete").unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(!text.contains("delete"), "{text}");
    assert!(!text.contains("confirm"), "빈 테이블이 남았다: {text}");
    assert!(text.contains("theme = \"nord\""), "{text}");
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.config.core.confirm.delete, "기본값으로 돌아간다");
    // 없는 키를 지워도 오류가 아니다
    td_config::reset_user_value(d.path(), "core.confirm.trash").unwrap();
}

#[test]
fn user_value_syntax_error_is_refused_and_file_untouched() {
    let broken = "[behavior\ntheme = ";
    let d = user_value_dir(Some(broken));
    let set = td_config::set_user_value(
        d.path(),
        "behavior.theme",
        td_config::ConfigValue::Str("dark".into()),
    );
    assert!(set.is_err());
    assert!(td_config::reset_user_value(d.path(), "behavior.theme").is_err());
    assert_eq!(
        fs::read_to_string(d.path().join("config.toml")).unwrap(),
        broken
    );
}

#[test]
fn fkeys_defaults_merge_and_unknown_key_warning() {
    // 기본값: F1~F12가 모두 빈 문자열(= 기본 바인딩 유지), 앱도 모두 미지정
    let none = load_from_strs(None, None, Platform::Linux);
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    for n in 1..=12 {
        let key = format!("F{n}");
        assert_eq!(none.config.fkeys.get(&key).map(String::as_str), Some(""));
        assert_eq!(
            none.config.fkey_apps.get(&key).map(String::as_str),
            Some("")
        );
    }
    assert_eq!(none.config.fkeys.len(), 12);

    // 옛 config.toml(fkeys 없음)은 그대로 읽힌다
    let old = load("[core.confirm]\ntrash = true\n");
    assert!(old.warnings.is_empty(), "{:?}", old.warnings);
    assert_eq!(old.config.fkeys.len(), 12);

    // 사용자 값은 그 키만 덮고 나머지는 기본값을 유지한다
    let l = load(
        "[fkeys]\nF2 = \"core.rename\"\nF3 = \"core.app.launch\"\nF5 = \"none\"\n[fkey_apps]\nF3 = \"/Applications/Foo.app\"\n",
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.fkeys["F2"], "core.rename");
    assert_eq!(l.config.fkeys["F3"], "core.app.launch");
    assert_eq!(l.config.fkeys["F5"], "none");
    assert_eq!(l.config.fkeys["F4"], "", "건드리지 않은 키는 기본값");
    assert_eq!(l.config.fkey_apps["F3"], "/Applications/Foo.app");

    // F1~F12 밖의 이름은 경고하고 무시한다
    let l = load("[fkeys]\nF13 = \"core.rename\"\n");
    assert!(
        l.warnings.iter().any(|w| w.message.contains("fkeys.F13")),
        "{:?}",
        l.warnings
    );
    assert!(!l.config.fkeys.contains_key("F13"));
}
