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
    assert!(
        none.config.behavior.layout.show_drive_bar,
        "드라이브 바는 기본으로 보인다"
    );
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
fn config_watch_same_size_edit_with_same_mtime_is_still_seen() {
    // 수정 시각 해상도가 거친 파일 시스템에서는 같은 길이로 두 번 고치면 (시각, 크기)가 같다. 내용으로 비교해야 놓치지 않는다.
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("config.toml");
    fs::write(&file, "[behavior.table]\nicon_size = 16\n").unwrap();
    let (_store, rx) = ConfigStore::start(dir.path(), Platform::Linux).unwrap();
    settle(&rx);

    let (mtime, len) = {
        let m = fs::metadata(&file).unwrap();
        (m.modified().unwrap(), m.len())
    };
    fs::write(&file, "[behavior.table]\nicon_size = 18\n").unwrap();
    fs::File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_modified(mtime)
        .unwrap();
    assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), mtime);
    assert_eq!(
        fs::metadata(&file).unwrap().len(),
        len,
        "크기가 같아야 시험이 된다"
    );
    let loaded = loop {
        let l = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("같은 크기·같은 시각의 편집도 재로딩 이벤트가 와야 한다");
        if l.config.behavior.table.icon_size == 18 {
            break l;
        }
    };
    assert!(loaded.warnings.is_empty());
}

#[test]
fn config_watch_ignores_unrelated_files() {
    // 같은 폴더의 state.json은 커서·선택이 바뀔 때마다 저장된다. 설정이 그대로면 재로딩 이벤트를 보내지 않아야 한다
    // (보내면 화면이 설정을 다시 받아 메뉴바 등을 매번 다시 만든다).
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("config.toml"),
        "[core.confirm]\ntrash = false\n",
    )
    .unwrap();
    let (_store, rx) = ConfigStore::start(dir.path(), Platform::Linux).unwrap();
    settle(&rx);

    for i in 0..3 {
        fs::write(dir.path().join("state.json.tmp"), format!("{{\"n\":{i}}}")).unwrap();
        fs::rename(
            dir.path().join("state.json.tmp"),
            dir.path().join("state.json"),
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(
        rx.recv_timeout(Duration::from_millis(2500)).is_err(),
        "설정 파일이 안 바뀌었는데 재로딩 이벤트가 왔다"
    );

    // 그래도 설정 파일이 바뀌면 반영된다
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
}

#[test]
fn text_color_is_validated() {
    // 이전 키와 테마별 키(이슈 #58)가 같은 규칙으로 검사된다.
    let get = |b: &td_config::Behavior, key: &str| match key {
        "text_color" => b.text_color.clone(),
        "text_color_dark" => b.text_color_dark.clone(),
        _ => b.text_color_light.clone(),
    };
    for key in ["text_color", "text_color_dark", "text_color_light"] {
        let color = |v: &str| load(&format!("[behavior]\n{key} = \"{v}\"\n"));
        for ok in ["#1a2b3c", "#abc", "#ABCDEF", ""] {
            let l = color(ok);
            assert!(l.warnings.is_empty(), "{key} {ok:?}: {:?}", l.warnings);
            assert_eq!(get(&l.config.behavior, key), ok);
        }
        for bad in [
            "red",
            "#12345",
            "#gggggg",
            "javascript:1",
            "#abc; background:url(x)",
            " #abc",
        ] {
            let l = color(bad);
            assert_eq!(l.warnings.len(), 1, "{key} {bad:?}: {:?}", l.warnings);
            assert!(
                l.warnings[0].message.contains(&format!("behavior.{key}:")),
                "{:?}",
                l.warnings
            );
            assert_eq!(
                get(&l.config.behavior, key),
                "",
                "{key} {bad:?}는 기본값(빈 문자열)으로 돌아간다"
            );
        }
        assert_eq!(
            get(&load("").config.behavior, key),
            "",
            "기본값은 테마 그대로"
        );
    }
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

    // 즐겨찾기는 `favorites.toml`에 쓴다(이슈 #106). 문법 오류가 있는 그 파일도 건드리지 않는다
    let fav = dir.path().join("favorites.toml");
    fs::write(&fav, "[broken\n").unwrap();
    assert!(append_favorite(dir.path(), "x", "/x").is_err());
    assert_eq!(fs::read_to_string(&fav).unwrap(), "[broken\n");
    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        inline,
        "config.toml은 그대로"
    );
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
    // 알 수 없는 이름은 경고하고 기본값
    let l = load("[behavior]\ntheme = \"sakura\"\n");
    assert_eq!(l.config.behavior.theme, "system");
    assert!(
        l.warnings.iter().any(|w| w.message.contains("theme")),
        "{:?}",
        l.warnings
    );
}

#[test]
fn theme_accepts_system_light_dark_and_every_theme_file_name() {
    assert_eq!(load("").config.behavior.theme, "system");
    let ids = td_config::THEME_IDS;
    assert_eq!(ids.len(), 112);
    for t in ["system", "light", "dark"].iter().chain(ids.iter()) {
        let l = load(&format!("[behavior]\ntheme = \"{t}\"\n"));
        assert!(l.warnings.is_empty(), "{t}: {:?}", l.warnings);
        assert_eq!(l.config.behavior.theme, *t);
    }
    assert!(ids.contains(&"catppuccin-mocha") && ids.contains(&"catppuccin-latte"));
}

#[test]
fn old_spaceui_theme_names_warn_and_fall_back_to_system() {
    for old in ["midnight", "noir", "slate", "nord", "mocha"] {
        let l = load(&format!("[behavior]\ntheme = \"{old}\"\n"));
        assert_eq!(l.config.behavior.theme, "system", "{old}");
        assert!(
            l.warnings.iter().any(|w| w.message.contains(old)),
            "{old}: {:?}",
            l.warnings
        );
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
        ConfigValue::Str("dracula-default".into()),
    )
    .unwrap();
    set_user_value(d.path(), "core.confirm.delete", ConfigValue::Bool(false)).unwrap();
    set_user_value(d.path(), "behavior.table.icon_size", ConfigValue::Int(24)).unwrap();
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.behavior.theme, "dracula-default");
    assert!(!l.config.core.confirm.delete);
    assert_eq!(l.config.behavior.table.icon_size, 24);
}

#[test]
fn user_value_set_writes_string_list_and_keeps_other_keys() {
    let d = user_value_dir(Some(
        "# 내 설정\n[behavior]\ntheme = \"dark\" # 테마\n\n[view.table]\ncolumns = [\"name\", \"size\", \"modified\"]\n",
    ));
    td_config::set_user_value(
        d.path(),
        "view.table.columns",
        td_config::ConfigValue::StrList(vec!["name".into(), "size:110".into(), "modified".into()]),
    )
    .unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(text.contains("# 내 설정"), "{text}");
    assert!(text.contains("theme = \"dark\" # 테마"), "{text}");
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(
        l.config.view.table.columns,
        ["name", "size:110", "modified"]
    );
    assert_eq!(l.config.behavior.theme, "dark");
}

#[test]
fn user_value_set_string_list_creates_missing_tables() {
    let d = user_value_dir(None);
    td_config::set_user_value(
        d.path(),
        "view.table.columns",
        td_config::ConfigValue::StrList(vec!["name".into(), ">size:90".into()]),
    )
    .unwrap();
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.view.table.columns, ["name", ">size:90"]);
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

#[test]
fn terminal_theme_defaults_to_following_app_theme_and_validates() {
    assert_eq!(load("").config.behavior.terminal_theme, "");
    for ok in ["light", "dark", "dracula-default"] {
        let l = load(&format!("[behavior]\nterminal_theme = \"{ok}\"\n"));
        assert!(l.warnings.is_empty(), "{ok}: {:?}", l.warnings);
        assert_eq!(l.config.behavior.terminal_theme, ok);
    }
    let l = load("[behavior]\nterminal_theme = \"nope\"\n");
    assert_eq!(l.config.behavior.terminal_theme, "");
    assert!(!l.warnings.is_empty());
}

#[test]
fn command_line_defaults_on_and_can_be_turned_off() {
    assert!(load("").config.behavior.layout.show_command_line);
    let l = load("[behavior.layout]\nshow_command_line = false\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(!l.config.behavior.layout.show_command_line);
}

#[test]
fn drive_bar_can_be_turned_off() {
    let l = load("[behavior.layout]\nshow_drive_bar = false\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(!l.config.behavior.layout.show_drive_bar);
    assert!(
        l.config.behavior.layout.show_action_bar,
        "건드리지 않은 Action Bar는 기본값"
    );
}

#[test]
fn font_settings_default_empty_and_stay_independent() {
    let none = load("");
    assert_eq!(none.config.behavior.ui_font, "");
    assert_eq!(
        none.config.behavior.preview_font,
        "Menlo, Consolas, monospace"
    );

    // 한쪽만 지정하면 다른 쪽은 기본값을 유지한다.
    let l = load("[behavior]\nui_font = \"Pretendard, sans-serif\"\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.behavior.ui_font, "Pretendard, sans-serif");
    assert_eq!(l.config.behavior.preview_font, "Menlo, Consolas, monospace");
    let l = load("[behavior]\npreview_font = \"D2Coding\"\n");
    assert_eq!(l.config.behavior.ui_font, "");
    assert_eq!(l.config.behavior.preview_font, "D2Coding");
}

#[test]
fn font_settings_round_trip_through_user_config() {
    use td_config::{set_user_value, ConfigValue};
    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.ui_font",
        ConfigValue::Str("Pretendard".into()),
    )
    .unwrap();
    set_user_value(
        dir.path(),
        "behavior.preview_font",
        ConfigValue::Str("D2Coding".into()),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.behavior.ui_font, "Pretendard");
    assert_eq!(l.config.behavior.preview_font, "D2Coding");

    // 하나만 바꿔도 다른 하나는 그대로다.
    set_user_value(
        dir.path(),
        "behavior.ui_font",
        ConfigValue::Str(String::new()),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert_eq!(l.config.behavior.ui_font, "");
    assert_eq!(l.config.behavior.preview_font, "D2Coding");
}

#[test]
fn preview_autoplay_defaults_off_and_stays_independent() {
    let none = load("");
    assert!(!none.config.preview.audio_autoplay);
    assert!(!none.config.preview.video_autoplay);
    let l = load("[preview]\naudio_autoplay = true\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.preview.audio_autoplay);
    assert!(!l.config.preview.video_autoplay);
    let l = load("[preview]\nvideo_autoplay = true\n");
    assert!(!l.config.preview.audio_autoplay);
    assert!(l.config.preview.video_autoplay);
}

#[test]
fn preview_autoplay_round_trips_through_user_config() {
    use td_config::{set_user_value, ConfigValue};
    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "preview.audio_autoplay",
        ConfigValue::Bool(true),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.config.preview.audio_autoplay && !l.config.preview.video_autoplay);
    set_user_value(
        dir.path(),
        "preview.video_autoplay",
        ConfigValue::Bool(true),
    )
    .unwrap();
    set_user_value(
        dir.path(),
        "preview.audio_autoplay",
        ConfigValue::Bool(false),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(!l.config.preview.audio_autoplay && l.config.preview.video_autoplay);
}

#[test]
fn removed_preview_office_key_in_an_old_user_config_still_loads() {
    // 예전 버전이 쓴 `[preview]` 아래 `office` 키는 이제 없다. 설정을 읽는 것은 막지 않고 다른 값은 그대로 읽는다.
    let l = load("[preview]\noffice = true\nvideo_autoplay = true\n");
    assert!(l.config.preview.video_autoplay, "{:?}", l.warnings);
    assert!(
        l.warnings.is_empty(),
        "지워진 키는 경고하지 않는다: {:?}",
        l.warnings
    );
    // 지워진 키가 아닌 모르는 키는 그대로 경고한다.
    let l = load("[preview]\nnot_a_key = true\n");
    assert_eq!(l.warnings.len(), 1, "{:?}", l.warnings);
}

#[test]
fn folder_size_on_select_defaults_to_true_and_can_be_turned_off() {
    let l = load("");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.display.folder_size_on_select, "기본은 켜짐");

    let l = load("[display]\nfolder_size_on_select = false\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(!l.config.display.folder_size_on_select);

    // 타입이 틀리면 경고하고 기본값을 쓴다
    let l = load("[display]\nfolder_size_on_select = \"no\"\n");
    assert!(l
        .warnings
        .iter()
        .any(|w| w.message.contains("folder_size_on_select")));
    assert!(l.config.display.folder_size_on_select);
}

#[test]
fn fkey_combo_keys_are_accepted_and_invalid_ones_warn() {
    let l = load(
        "[fkeys]\n\"Ctrl+F5\" = \"core.copy\"\n\"Mod+Shift+F2\" = \"core.app.launch\"\nF5 = \"core.move\"\n[fkey_apps]\n\"Mod+Shift+F2\" = \"/Applications/Foo.app\"\n",
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.fkeys["Ctrl+F5"], "core.copy");
    assert_eq!(l.config.fkeys["Mod+Shift+F2"], "core.app.launch");
    assert_eq!(l.config.fkeys["F5"], "core.move");
    assert_eq!(l.config.fkey_apps["Mod+Shift+F2"], "/Applications/Foo.app");
    assert_eq!(l.config.fkeys.len(), 14, "기본 12개 + 조합 2개");

    for bad in [
        "Ctrl+A",
        "F13",
        "Foo+F1",
        "Shift+Ctrl+F1",
        "Ctrl+Ctrl+F1",
        "Ctrl+F0",
    ] {
        let l = load(&format!("[fkeys]\n\"{bad}\" = \"core.copy\"\n"));
        assert!(
            l.warnings
                .iter()
                .any(|w| w.message.contains(&format!("fkeys.{bad}"))),
            "{bad}: {:?}",
            l.warnings
        );
        assert!(!l.config.fkeys.contains_key(bad), "{bad}");
    }
}

#[test]
fn fkey_combo_round_trips_through_user_config() {
    use td_config::{reset_user_value, set_user_value, ConfigValue};
    let dir = tempfile::tempdir().unwrap();
    set_user_value(dir.path(), "fkeys.Ctrl+F5", ConfigValue::Str(String::new())).unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.fkeys["Ctrl+F5"], "");
    set_user_value(
        dir.path(),
        "fkeys.Ctrl+F5",
        ConfigValue::Str("core.copy".into()),
    )
    .unwrap();
    assert_eq!(
        load_dir(dir.path(), Platform::Linux).config.fkeys["Ctrl+F5"],
        "core.copy"
    );
    reset_user_value(dir.path(), "fkeys.Ctrl+F5").unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(!l.config.fkeys.contains_key("Ctrl+F5"));
}

#[test]
fn fkey_bar_defaults_and_round_trips_including_combos() {
    use td_config::{reset_user_value, set_user_value, ConfigValue};
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert_eq!(none.config.fkey_bar.len(), 13);
    for (k, on) in &none.config.fkey_bar {
        let want = matches!(
            k.as_str(),
            "F1" | "F2" | "F4" | "F5" | "F6" | "F7" | "F8" | "Shift+F8"
        );
        assert_eq!(*on, want, "{k} 기본 노출");
    }

    let dir = tempfile::tempdir().unwrap();
    set_user_value(dir.path(), "fkey_bar.F2", ConfigValue::Bool(true)).unwrap();
    set_user_value(dir.path(), "fkey_bar.Ctrl+F5", ConfigValue::Bool(true)).unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.fkey_bar["F2"] && l.config.fkey_bar["Ctrl+F5"]);
    assert!(!l.config.fkey_bar["F3"]);
    reset_user_value(dir.path(), "fkey_bar.Ctrl+F5").unwrap();
    assert!(!load_dir(dir.path(), Platform::Linux)
        .config
        .fkey_bar
        .contains_key("Ctrl+F5"));

    // 잘못된 키와 불리언이 아닌 값은 경고하고 무시한다
    let l = load("[fkey_bar]\nF13 = true\n\"Ctrl+A\" = true\n\"Ctrl+F5\" = \"yes\"\n");
    assert_eq!(l.warnings.len(), 3, "{:?}", l.warnings);
    assert!(!l.config.fkey_bar.contains_key("Ctrl+F5"));
}

#[test]
fn remove_favorite_drops_matching_entry_and_keeps_the_rest() {
    use td_config::remove_favorite;
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("config.toml"),
        "# 내 설정\n[[favorites]]\nname = \"A\"\npath = \"/a\"\n\n[[favorites]]\nname = \"B\"\npath = \"${user.downloads}\"\n",
    )
    .unwrap();
    // 즐겨찾기는 `favorites.toml`에서 지운다(이슈 #106). 옛 `config.toml`의 항목은 먼저 그 파일로 옮겨 오고 `config.toml`은 그대로다.
    remove_favorite(dir.path(), "${user.downloads}").unwrap();
    let text = std::fs::read_to_string(dir.path().join("favorites.toml")).unwrap();
    assert!(text.contains("path = \"/a\""), "{text}");
    assert!(
        std::fs::read_to_string(dir.path().join("config.toml"))
            .unwrap()
            .contains("downloads"),
        "config.toml은 건드리지 않는다"
    );
    assert!(!text.contains("downloads"), "{text}");
    // 없는 경로나 파일이 없는 경우는 오류가 아니다.
    remove_favorite(dir.path(), "/nope").unwrap();
    remove_favorite(tempfile::tempdir().unwrap().path(), "/a").unwrap();
    // 인라인 배열과 그룹 안 항목도 지운다.
    std::fs::write(
        dir.path().join("favorites.toml"),
        "favorites = [{ kind = \"group\", name = \"G\", items = [{ name = \"X\", path = \"/x\" }, { name = \"Y\", path = \"/y\" }] }]\n",
    )
    .unwrap();
    remove_favorite(dir.path(), "/x").unwrap();
    let text = std::fs::read_to_string(dir.path().join("favorites.toml")).unwrap();
    assert!(!text.contains("/x") && text.contains("/y"), "{text}");
}

#[test]
fn terminal_font_defaults_empty_is_separate_from_preview_font_and_user_can_set_it() {
    use td_config::{set_user_value, ConfigValue};
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert_eq!(none.config.behavior.terminal_font, "");
    let l = load("[behavior]\npreview_font = \"D2Coding\"\n");
    assert_eq!(l.config.behavior.preview_font, "D2Coding");
    assert_eq!(
        l.config.behavior.terminal_font, "",
        "미리보기 글꼴을 바꿔도 터미널 글꼴은 그대로"
    );
    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.terminal_font",
        ConfigValue::Str("Fira Code, monospace".into()),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.behavior.terminal_font, "Fira Code, monospace");
    assert_eq!(l.config.behavior.preview_font, "Menlo, Consolas, monospace");
}

#[test]
fn terminal_shell_defaults_to_default_accepts_the_three_windows_shells_and_rejects_others() {
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert_eq!(none.config.environment.terminal, "default");
    for shell in ["cmd", "powershell", "gitbash"] {
        let l = load(&format!("[environment]\nterminal = \"{shell}\"\n"));
        assert!(l.warnings.is_empty(), "{:?}", l.warnings);
        assert_eq!(l.config.environment.terminal, shell);
    }
    let l = load("[environment]\nterminal = \"zsh\"\n");
    assert!(
        l.warnings
            .iter()
            .any(|w| w.message.contains("environment.terminal")),
        "{:?}",
        l.warnings
    );
    assert_eq!(
        l.config.environment.terminal, "default",
        "잘못된 값은 기본값"
    );
}

#[test]
fn show_parent_row_defaults_off_and_user_can_turn_it_on() {
    use td_config::{set_user_value, ConfigValue};
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert!(!none.config.behavior.table.show_parent_row);

    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.table.show_parent_row",
        ConfigValue::Bool(true),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.behavior.table.show_parent_row);
}

#[test]
fn keep_extension_defaults_off_and_user_can_turn_it_on() {
    use td_config::{set_user_value, ConfigValue};
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert!(!none.config.behavior.table.keep_extension);

    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.table.keep_extension",
        ConfigValue::Bool(true),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.behavior.table.keep_extension);
}

#[test]
fn group_by_modified_defaults_off_and_user_can_turn_it_on() {
    use td_config::{set_user_value, ConfigValue};
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert!(!none.config.behavior.table.group_by_modified);

    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.table.group_by_modified",
        ConfigValue::Bool(true),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.behavior.table.group_by_modified);
}

#[test]
fn list_appearance_defaults_round_trip_and_validate_folder_style() {
    use td_config::{set_user_value, ConfigValue};
    // 기본값은 지금 모양과 같다
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    let t = &none.config.behavior.table;
    assert!(!t.zebra_rows);
    assert!(t.show_marks);
    assert_eq!(t.folder_style, "none");
    assert!(!t.cursor_fill);

    // 사용자 설정이 그 키만 바꾼다
    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.table.zebra_rows",
        ConfigValue::Bool(true),
    )
    .unwrap();
    set_user_value(
        dir.path(),
        "behavior.table.show_marks",
        ConfigValue::Bool(false),
    )
    .unwrap();
    set_user_value(
        dir.path(),
        "behavior.table.folder_style",
        ConfigValue::Str("brackets".into()),
    )
    .unwrap();
    set_user_value(
        dir.path(),
        "behavior.table.cursor_fill",
        ConfigValue::Bool(true),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    let t = &l.config.behavior.table;
    assert!(t.zebra_rows && !t.show_marks && t.cursor_fill);
    assert_eq!(t.folder_style, "brackets");
    assert_eq!(t.icon_size, 16, "건드리지 않은 키는 기본값");

    // 허용값 밖은 경고하고 none으로 되돌린다
    for ok in ["none", "brackets", "parens", "slash"] {
        let l = load(&format!("[behavior.table]\nfolder_style = \"{ok}\"\n"));
        assert!(l.warnings.is_empty(), "{ok}: {:?}", l.warnings);
        assert_eq!(l.config.behavior.table.folder_style, ok);
    }
    let l = load("[behavior.table]\nfolder_style = \"x\"\n");
    assert!(
        l.warnings
            .iter()
            .any(|w| w.message.contains("folder_style")),
        "{:?}",
        l.warnings
    );
    assert_eq!(l.config.behavior.table.folder_style, "none");
}

#[test]
fn pane_tab_appearance_defaults_round_trip_and_validate_tab_style() {
    use td_config::{set_user_value, ConfigValue};
    // 기본값은 지금 모양과 같다
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert!(none.config.behavior.layout.pane_highlight);
    assert_eq!(none.config.behavior.layout.tab_style, "underline");

    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.layout.pane_highlight",
        ConfigValue::Bool(false),
    )
    .unwrap();
    set_user_value(
        dir.path(),
        "behavior.layout.tab_style",
        ConfigValue::Str("segments".into()),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(!l.config.behavior.layout.pane_highlight);
    assert_eq!(l.config.behavior.layout.tab_style, "segments");
    assert!(
        l.config.behavior.layout.show_action_bar,
        "건드리지 않은 키는 기본값"
    );

    for ok in ["underline", "segments"] {
        let l = load(&format!("[behavior.layout]\ntab_style = \"{ok}\"\n"));
        assert!(l.warnings.is_empty(), "{ok}: {:?}", l.warnings);
        assert_eq!(l.config.behavior.layout.tab_style, ok);
    }
    let l = load("[behavior.layout]\ntab_style = \"round\"\n");
    assert!(
        l.warnings.iter().any(|w| w.message.contains("tab_style")),
        "{:?}",
        l.warnings
    );
    assert_eq!(l.config.behavior.layout.tab_style, "underline");
}

#[test]
fn tab_position_defaults_top_and_validates() {
    use td_config::{set_user_value, ConfigValue};
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert_eq!(none.config.behavior.layout.tab_position, "top");

    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.layout.tab_position",
        ConfigValue::Str("bottom".into()),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.behavior.layout.tab_position, "bottom");

    let l = load("[behavior.layout]\ntab_position = \"side\"\n");
    assert!(
        l.warnings
            .iter()
            .any(|w| w.message.contains("tab_position")),
        "{:?}",
        l.warnings
    );
    assert_eq!(l.config.behavior.layout.tab_position, "top");
}

#[test]
fn tab_colors_default_auto_and_validate() {
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    let layout = &none.config.behavior.layout;
    for v in [
        &layout.tab_color_terminal,
        &layout.tab_color_smb,
        &layout.tab_color_remote,
        &layout.tab_color_twindeck,
    ] {
        assert_eq!(v, "auto");
    }

    let l = load(
        "[behavior.layout]\ntab_color_terminal = \"off\"\ntab_color_smb = \"#1a2B3c\"\ntab_color_remote = \"#abc\"\n",
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.behavior.layout.tab_color_terminal, "off");
    assert_eq!(l.config.behavior.layout.tab_color_smb, "#1a2B3c");
    assert_eq!(l.config.behavior.layout.tab_color_remote, "#abc");

    let l = load("[behavior.layout]\ntab_color_twindeck = \"red\"\ntab_color_smb = 3\n");
    for key in ["tab_color_twindeck", "tab_color_smb"] {
        assert!(
            l.warnings.iter().any(|w| w.message.contains(key)),
            "{key}: {:?}",
            l.warnings
        );
    }
    assert_eq!(l.config.behavior.layout.tab_color_twindeck, "auto");
    assert_eq!(l.config.behavior.layout.tab_color_smb, "auto");
}

#[test]
fn server_icons_are_read_and_saved() {
    let l = load(
        r#"
[[smb.servers]]
host = "nas.local"
share = "media"
icon = " 🗄️ "

[[remote.servers]]
protocol = "sftp"
host = "example.com"
icon = "🏠"

[[remote.servers]]
protocol = "ftp"
host = "ftp.example.com"
"#,
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.smb.servers[0].icon, "🗄️");
    assert_eq!(l.config.remote.servers[0].icon, "🏠");
    assert_eq!(l.config.remote.servers[1].icon, "");

    let d = tempfile::tempdir().unwrap();
    let mut s = smb("n", "h", "s", "");
    s.icon = "📁".into();
    td_config::set_smb_servers(d.path(), &[s, smb("m", "h", "t", "")]).unwrap();
    let mut r = remote("r", "sftp", "h", 22, "", "");
    r.icon = "🚀".into();
    td_config::set_remote_servers(d.path(), &[r, remote("q", "ftp", "h", 21, "", "")]).unwrap();
    let text = std::fs::read_to_string(d.path().join("config.toml")).unwrap();
    // 빈 아이콘은 키를 쓰지 않는다.
    assert_eq!(text.matches("icon = ").count(), 2, "{text}");
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.smb.servers[0].icon, "📁");
    assert_eq!(l.config.smb.servers[1].icon, "");
    assert_eq!(l.config.remote.servers[0].icon, "🚀");
    assert_eq!(l.config.remote.servers[1].icon, "");
}

#[test]
fn tab_close_button_defaults_off_and_round_trips() {
    use td_config::{set_user_value, ConfigValue};
    let none = load("");
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert!(!none.config.behavior.layout.tab_close_button);

    let dir = tempfile::tempdir().unwrap();
    set_user_value(
        dir.path(),
        "behavior.layout.tab_close_button",
        ConfigValue::Bool(true),
    )
    .unwrap();
    let l = load_dir(dir.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.behavior.layout.tab_close_button);
}

#[test]
fn preview_limits_default_and_accept_zero() {
    let none = load_from_strs(None, None, Platform::Linux);
    assert!(none.warnings.is_empty(), "{:?}", none.warnings);
    assert_eq!(
        (
            none.config.preview.image_max_mb,
            none.config.preview.pdf_max_mb,
            none.config.preview.audio_max_mb
        ),
        (10, 10, 20)
    );
    let l = load("[preview]\nimage_max_mb = 0\npdf_max_mb = 64\naudio_max_mb = 1\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(
        (
            l.config.preview.image_max_mb,
            l.config.preview.pdf_max_mb,
            l.config.preview.audio_max_mb
        ),
        (0, 64, 1)
    );
}

#[test]
fn preview_limits_invalid_values_warn_and_keep_defaults() {
    for bad in ["-5", "\"큼\"", "1.5", "true"] {
        let l = load(&format!("[preview]\npdf_max_mb = {bad}\n"));
        assert!(!l.warnings.is_empty(), "{bad}: 경고가 있어야 한다");
        assert_eq!(
            l.config.preview.pdf_max_mb, 10,
            "{bad}: 기본값으로 돌아간다"
        );
    }
}

#[test]
fn preview_pdf_direct_defaults_off_and_validates() {
    let none = load_from_strs(None, None, Platform::Linux);
    assert!(!none.config.preview.pdf_direct);
    let on = load("[preview]\npdf_direct = true\n");
    assert!(on.warnings.is_empty(), "{:?}", on.warnings);
    assert!(on.config.preview.pdf_direct);
    let bad = load("[preview]\npdf_direct = \"켜\"\n");
    assert!(!bad.warnings.is_empty());
    assert!(
        !bad.config.preview.pdf_direct,
        "문자열은 기본값(꺼짐)으로 돌아간다"
    );
}

#[test]
fn behavior_table_system_icons_defaults_off_and_validates() {
    let none = load_from_strs(None, None, Platform::Linux);
    assert!(!none.config.behavior.table.system_icons);
    let on = load("[behavior.table]\nsystem_icons = true\n");
    assert!(on.warnings.is_empty(), "{:?}", on.warnings);
    assert!(on.config.behavior.table.system_icons);
    let bad = load("[behavior.table]\nsystem_icons = \"켜\"\n");
    assert!(!bad.warnings.is_empty());
    assert!(
        !bad.config.behavior.table.system_icons,
        "문자열은 기본값(꺼짐)으로 돌아간다"
    );
    assert_eq!(
        bad.config.behavior.table.icon_size, 16,
        "다른 키는 영향을 받지 않는다"
    );
}

#[test]
fn column_lines_defaults_to_none_and_validates() {
    let d = user_value_dir(None);
    assert_eq!(
        load_dir(d.path(), Platform::Linux)
            .config
            .behavior
            .table
            .column_lines,
        "none"
    );
    for ok in ["none", "solid", "dash"] {
        let d = user_value_dir(Some(&format!(
            "[behavior.table]\ncolumn_lines = \"{ok}\"\n"
        )));
        let l = load_dir(d.path(), Platform::Linux);
        assert!(l.warnings.is_empty(), "{:?}", l.warnings);
        assert_eq!(l.config.behavior.table.column_lines, ok);
    }
    let d = user_value_dir(Some("[behavior.table]\ncolumn_lines = \"x\"\n"));
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l
        .warnings
        .iter()
        .any(|w| w.message.contains("column_lines")));
    assert_eq!(l.config.behavior.table.column_lines, "none");
}

#[test]
fn global_hotkey_defaults_to_mod_alt_o_and_can_be_cleared() {
    let d = user_value_dir(None);
    assert_eq!(
        load_dir(d.path(), Platform::Linux)
            .config
            .environment
            .global_hotkey,
        "Mod+Alt+O"
    );
    let d = user_value_dir(Some("[environment]\nglobal_hotkey = \"\"\n"));
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.environment.global_hotkey, "");
}

#[test]
fn global_hotkey_enabled_defaults_on_and_can_be_turned_off() {
    let d = user_value_dir(None);
    assert!(
        load_dir(d.path(), Platform::Linux)
            .config
            .environment
            .global_hotkey_enabled
    );
    let d = user_value_dir(Some("[environment]\nglobal_hotkey_enabled = false\n"));
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(!l.config.environment.global_hotkey_enabled);
}

#[test]
fn background_on_close_defaults_off_and_can_be_turned_on() {
    let d = user_value_dir(None);
    assert!(
        !load_dir(d.path(), Platform::Linux)
            .config
            .environment
            .background_on_close
    );
    let d = user_value_dir(Some("[environment]\nbackground_on_close = true\n"));
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.environment.background_on_close);
}

#[test]
fn auto_update_check_defaults_on_and_can_be_turned_off() {
    let d = user_value_dir(None);
    assert!(
        load_dir(d.path(), Platform::Linux)
            .config
            .environment
            .auto_update_check
    );
    let d = user_value_dir(Some("[environment]\nauto_update_check = false\n"));
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(!l.config.environment.auto_update_check);
}

#[test]
fn single_instance_defaults_on_and_can_be_turned_off() {
    let d = user_value_dir(None);
    assert!(
        load_dir(d.path(), Platform::Linux)
            .config
            .environment
            .single_instance
    );
    let d = user_value_dir(Some("[environment]\nsingle_instance = false\n"));
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(!l.config.environment.single_instance);
}

fn smb(name: &str, host: &str, share: &str, user: &str) -> td_config::SmbServer {
    td_config::SmbServer {
        name: name.into(),
        host: host.into(),
        share: share.into(),
        user: user.into(),
        icon: String::new(),
    }
}

#[test]
fn smb_servers_default_to_empty() {
    let l = load_from_strs(None, None, Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.smb.servers.is_empty());
}

#[test]
fn smb_servers_are_read_from_user_config() {
    let l = load(
        r#"
[[smb.servers]]
name = "사무실 NAS"
host = "nas.local"
share = "공유 폴더"
user = "me"

[[smb.servers]]
host = "10.0.0.5"
share = "public"
"#,
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(
        l.config.smb.servers,
        [
            smb("사무실 NAS", "nas.local", "공유 폴더", "me"),
            // name이 없으면 host/share, user가 없으면 게스트(빈 문자열)
            smb("10.0.0.5/public", "10.0.0.5", "public", ""),
        ]
    );
}

#[test]
fn smb_servers_without_host_or_share_are_dropped_with_warning() {
    let l = load(
        r#"
[[smb.servers]]
name = "호스트 없음"
host = ""
share = "a"

[[smb.servers]]
host = "nas"

[[smb.servers]]
name = ""
host = "nas"
share = "b"
"#,
    );
    assert_eq!(l.config.smb.servers, [smb("nas/b", "nas", "b", "")]);
    assert_eq!(l.warnings.len(), 2, "{:?}", l.warnings);
    assert!(l.warnings[0].message.starts_with("smb.servers[1]"));
    assert!(l.warnings[1].message.starts_with("smb.servers[2]"));

    // 테이블이 아닌 항목도 빠지고 경고, 목록이 배열이 아니면 기본값(빈 목록)
    let l = load("[smb]\nservers = [\"nas\"]\n");
    assert!(l.config.smb.servers.is_empty());
    assert_eq!(l.warnings.len(), 1, "{:?}", l.warnings);
    let l = load("[smb]\nservers = 3\n");
    assert!(l.config.smb.servers.is_empty());
    assert_eq!(l.warnings.len(), 1, "{:?}", l.warnings);
}

#[test]
fn smb_servers_write_then_read_back_and_keep_other_settings() {
    let d = user_value_dir(Some(
        "# 내 설정\n[behavior]\ntheme = \"dark\" # 테마\n\n[[favorites]]\nname = \"A\"\npath = \"/a\"\n",
    ));
    let servers = [
        smb("NAS \"집\"", "nas.local", "공유 폴더", "DOMAIN;me"),
        smb("공개", "10.0.0.5:445", "public", ""),
    ];
    td_config::set_smb_servers(d.path(), &servers).unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(text.contains("# 내 설정"), "{text}");
    assert!(text.contains("theme = \"dark\" # 테마"), "{text}");
    assert!(text.contains("[[smb.servers]]"), "{text}");
    assert!(
        !text.contains("[smb]\n"),
        "빈 [smb] 머리글이 찍혔다: {text}"
    );
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.smb.servers, servers);
    assert_eq!(l.config.behavior.theme, "dark");
    assert_eq!(l.config.favorites.len(), 1);

    // 다시 쓰면 목록이 통째로 바뀐다
    td_config::set_smb_servers(d.path(), &servers[1..]).unwrap();
    let l = load_dir(d.path(), Platform::Linux);
    assert_eq!(l.config.smb.servers, servers[1..]);

    // 빈 목록이면 키를 지운다
    td_config::set_smb_servers(d.path(), &[]).unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(!text.contains("smb"), "{text}");
    assert!(text.contains("# 내 설정"), "{text}");
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.smb.servers.is_empty());
    assert_eq!(l.config.favorites.len(), 1);
}

#[test]
fn smb_servers_write_creates_file_and_replaces_inline_array() {
    let d = user_value_dir(None);
    td_config::set_smb_servers(d.path(), &[smb("n", "h", "s", "u")]).unwrap();
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.smb.servers, [smb("n", "h", "s", "u")]);

    let d = user_value_dir(Some(
        "[smb]\nservers = [ { host = \"old\", share = \"x\" } ]\n",
    ));
    td_config::set_smb_servers(d.path(), &[smb("n", "h", "s", "")]).unwrap();
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.smb.servers, [smb("n", "h", "s", "")]);
}

#[test]
fn smb_servers_write_refuses_invalid_entries_and_broken_file() {
    let original = "[behavior]\ntheme = \"dark\"\n";
    let d = user_value_dir(Some(original));
    assert!(td_config::set_smb_servers(d.path(), &[smb("n", "h", " ", "")]).is_err());
    assert!(td_config::set_smb_servers(d.path(), &[smb("n", "", "s", "")]).is_err());
    assert_eq!(
        fs::read_to_string(d.path().join("config.toml")).unwrap(),
        original
    );

    let broken = "[behavior\ntheme = ";
    let d = user_value_dir(Some(broken));
    assert!(td_config::set_smb_servers(d.path(), &[smb("n", "h", "s", "")]).is_err());
    assert_eq!(
        fs::read_to_string(d.path().join("config.toml")).unwrap(),
        broken
    );
}

fn remote(
    name: &str,
    protocol: &str,
    host: &str,
    port: u16,
    user: &str,
    base_dir: &str,
) -> td_config::RemoteServer {
    td_config::RemoteServer {
        name: name.into(),
        protocol: protocol.into(),
        host: host.into(),
        port,
        user: user.into(),
        base_dir: base_dir.into(),
        icon: String::new(),
    }
}

#[test]
fn remote_servers_default_to_empty() {
    let l = load("");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert!(l.config.remote.servers.is_empty());
}

#[test]
fn remote_servers_are_read_and_filled_with_defaults() {
    let l = load(
        r#"
[[remote.servers]]
name = "회사 서버"
protocol = "SFTP"
host = "files.example.com"
port = 2222
user = "me"
base_dir = "/srv/data"

[[remote.servers]]
protocol = "ftp"
host = "ftp.example.com"
user = "kim"

[[remote.servers]]
protocol = "sftp"
host = "10.0.0.7"
port = 0
"#,
    );
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(
        l.config.remote.servers,
        [
            remote(
                "회사 서버",
                "sftp",
                "files.example.com",
                2222,
                "me",
                "/srv/data"
            ),
            remote(
                "kim@ftp.example.com",
                "ftp",
                "ftp.example.com",
                21,
                "kim",
                ""
            ),
            remote("10.0.0.7", "sftp", "10.0.0.7", 22, "", ""),
        ]
    );
}

#[test]
fn remote_servers_with_bad_protocol_host_or_port_are_dropped_with_warning() {
    let l = load(
        r#"
[[remote.servers]]
protocol = "smb"
host = "a"

[[remote.servers]]
protocol = "sftp"
host = "  "

[[remote.servers]]
protocol = "ftp"
host = "b"
port = 70000

[[remote.servers]]
protocol = "ftp"
host = "ok"
"#,
    );
    assert_eq!(
        l.config.remote.servers,
        [remote("ok", "ftp", "ok", 21, "", "")]
    );
    assert_eq!(l.warnings.len(), 3, "{:?}", l.warnings);
    assert!(l.warnings[0].message.starts_with("remote.servers[1]"));
    assert!(l.warnings[1].message.starts_with("remote.servers[2]"));
    assert!(l.warnings[2].message.starts_with("remote.servers[3]"));

    assert!(load("[remote]\nservers = [\"x\"]\n")
        .config
        .remote
        .servers
        .is_empty());
    assert!(load("[remote]\nservers = 3\n")
        .config
        .remote
        .servers
        .is_empty());
}

#[test]
fn remote_servers_write_then_read_back_and_keep_other_settings() {
    let d = user_value_dir(Some(
        "# 내 설정\n[behavior]\ntheme = \"dark\" # 테마\n\n[[favorites]]\nname = \"A\"\npath = \"/a\"\n",
    ));
    let servers = [
        remote("집 NAS", "sftp", "nas.local", 22, "me", "/volume1"),
        remote("공개 FTP", "ftp", "ftp.example.com", 2121, "", ""),
    ];
    td_config::set_remote_servers(d.path(), &servers).unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(text.contains("# 내 설정"), "{text}");
    assert!(text.contains("[[remote.servers]]"), "{text}");
    assert!(
        !text.contains("[remote]\n"),
        "빈 [remote] 머리글이 찍혔다: {text}"
    );
    let l = load_dir(d.path(), Platform::Linux);
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    assert_eq!(l.config.remote.servers, servers);
    assert_eq!(l.config.behavior.theme, "dark");
    assert_eq!(l.config.favorites.len(), 1);

    td_config::set_remote_servers(d.path(), &servers[1..]).unwrap();
    assert_eq!(
        load_dir(d.path(), Platform::Linux).config.remote.servers,
        servers[1..]
    );

    td_config::set_remote_servers(d.path(), &[]).unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(!text.contains("remote"), "{text}");
    assert!(text.contains("# 내 설정"), "{text}");
}

#[test]
fn remote_servers_write_rejects_invalid_entries_without_touching_the_file() {
    let d = user_value_dir(Some("# 그대로\n"));
    let before = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(
        td_config::set_remote_servers(d.path(), &[remote("n", "smb", "h", 1, "", "")]).is_err()
    );
    assert!(
        td_config::set_remote_servers(d.path(), &[remote("n", "ftp", " ", 21, "", "")]).is_err()
    );
    assert_eq!(
        fs::read_to_string(d.path().join("config.toml")).unwrap(),
        before
    );
}

#[test]
fn remote_servers_accept_twindeck_with_default_port_2222_and_keep_other_protocols() {
    let l = load("[[remote.servers]]\nprotocol = \"twindeck\"\nhost = \"h\"\n\n[[remote.servers]]\nprotocol = \"sftp\"\nhost = \"s\"\n");
    assert!(l.warnings.is_empty(), "{:?}", l.warnings);
    let ports: Vec<_> = l
        .config
        .remote
        .servers
        .iter()
        .map(|s| (s.protocol.as_str(), s.port))
        .collect();
    assert_eq!(ports, [("twindeck", 2222), ("sftp", 22)]);

    let d = user_value_dir(None);
    let servers = [
        remote("집", "twindeck", "home.local", 2222, "me", ""),
        remote("회사", "sftp", "files", 22, "kim", ""),
    ];
    td_config::set_remote_servers(d.path(), &servers).unwrap();
    assert_eq!(
        load_dir(d.path(), Platform::Linux).config.remote.servers,
        servers
    );
}

#[test]
fn remote_server_password_is_never_written_to_or_kept_from_config() {
    // 서버 항목에는 비밀번호 필드가 없다: 저장한 config.toml에도, 읽은 설정(JSON)에도 비밀번호가 나오지 않는다.
    let d = user_value_dir(None);
    td_config::set_remote_servers(d.path(), &[remote("n", "sftp", "h", 22, "me", "")]).unwrap();
    let text = fs::read_to_string(d.path().join("config.toml")).unwrap();
    assert!(!text.to_lowercase().contains("password"), "{text}");
    assert!(!text.contains("비밀번호"), "{text}");

    // 사용자가 손으로 `password`를 적어 넣어도 설정에는 실리지 않는다(UI·내보내기로 새지 않게).
    let l =
        load("[[remote.servers]]\nprotocol = \"ftp\"\nhost = \"h\"\npassword = \"s3cret-값\"\n");
    let json = format!("{:?}", l.config);
    assert!(!json.contains("s3cret"), "{json}");
    assert_eq!(l.config.remote.servers.len(), 1);
}

#[test]
fn 원격_서버_기본값은_꺼짐_모든_주소_수신_읽기_전용이다() {
    let c = load("").config.remote_server;
    assert!(!c.enabled);
    assert_eq!(c.bind, "0.0.0.0");
    assert_eq!(c.port, 2222);
    assert_eq!(c.root, "");
    assert!(!c.allow_write);
    assert!(!c.allow_shell);
    assert_eq!(c.user, "twindeck");
}

#[test]
fn 원격_서버_포트_범위와_빈_bind는_경고하고_기본값으로_돌아간다() {
    for bad in ["port = 0", "port = 70000", "port = -1"] {
        let l = load(&format!("[remote_server]\n{bad}\n"));
        assert_eq!(l.config.remote_server.port, 2222, "{bad}");
        assert!(
            l.warnings
                .iter()
                .any(|w| w.message.contains("remote_server.port")),
            "{bad}"
        );
    }
    let l = load("[remote_server]\nbind = \"  \"\nuser = \"\"\n");
    assert_eq!(l.config.remote_server.bind, "0.0.0.0");
    assert_eq!(l.config.remote_server.user, "twindeck");
    assert_eq!(l.warnings.len(), 2);
    let ok = load("[remote_server]\nport = 65535\nbind = \"0.0.0.0\"\nenabled = true\n");
    assert_eq!(ok.config.remote_server.port, 65535);
    assert!(ok.warnings.is_empty());
}

#[test]
fn 원격_서버_설정은_사용자_설정_저장과_다시_읽기가_된다() {
    let dir = tempfile::tempdir().unwrap();
    td_config::set_user_value(
        dir.path(),
        "remote_server.enabled",
        td_config::ConfigValue::Bool(true),
    )
    .unwrap();
    td_config::set_user_value(
        dir.path(),
        "remote_server.port",
        td_config::ConfigValue::Int(2200),
    )
    .unwrap();
    td_config::set_user_value(
        dir.path(),
        "remote_server.root",
        td_config::ConfigValue::Str("/tmp/share".into()),
    )
    .unwrap();
    let c = td_config::load_dir(dir.path(), td_config::Platform::current())
        .config
        .remote_server;
    assert!(c.enabled);
    assert_eq!(c.port, 2200);
    assert_eq!(c.root, "/tmp/share");
    assert_eq!(c.bind, "0.0.0.0");
}
