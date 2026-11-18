//! 설정 화면이 `keybindings.toml`의 항목 하나를 고치고, 옛 `config.toml`의 `[fkeys]`를 이 파일로 옮긴다.
//! `toml_edit`로 그 항목만 바꾸고 다른 항목·주석·순서는 그대로 둔다.

use std::fs;
use std::path::Path;

use toml_edit::{DocumentMut, InlineTable, Item, Table, Value};

use crate::keybindings::BindingSpec;
use crate::load::Platform;
use crate::store::{read_user_doc, write_doc, write_user_doc};

const FILE: &str = "keybindings.toml";
const OS_SECTIONS: [&str; 3] = ["macos", "windows", "linux"];

fn read_doc(dir: &Path) -> Result<DocumentMut, String> {
    let text = match fs::read_to_string(dir.join(FILE)) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("keybindings.toml을 읽지 못했습니다: {e}")),
    };
    text.parse::<DocumentMut>()
        .map_err(|_| "keybindings.toml에 문법 오류가 있어 단축키를 바꾸지 않았습니다".to_string())
}

/// `[keybindings]` 테이블. 없으면 만들고, 비어 있으면 머리글 없이 하위 섹션만 찍히게 암시적으로 둔다.
fn section(doc: &mut DocumentMut) -> Result<&mut Table, String> {
    let item = doc.as_table_mut().entry("keybindings").or_insert_with(|| {
        let mut t = Table::new();
        t.set_implicit(true);
        Item::Table(t)
    });
    item.as_table_mut()
        .ok_or_else(|| "keybindings는 테이블이어야 합니다".to_string())
}

fn os_table(root: &mut Table, platform: Platform) -> Result<&mut Table, String> {
    root.entry(platform.section_name())
        .or_insert_with(|| Item::Table(Table::new()))
        .as_table_mut()
        .ok_or_else(|| "keybindings의 OS 섹션은 테이블이어야 합니다".to_string())
}

/// 테이블에서 `key`와 대소문자를 무시하고 같은 키 이름(OS 하위 섹션 제외).
fn find(table: &Table, key: &str) -> Option<String> {
    table
        .iter()
        .map(|(k, _)| k)
        .find(|k| !OS_SECTIONS.contains(k) && k.eq_ignore_ascii_case(key))
        .map(str::to_string)
}

fn value_of(spec: &BindingSpec) -> Value {
    let Some(action) = &spec.action else {
        return "none".into();
    };
    if spec.args.is_empty() && spec.scope.is_none() {
        return action.as_str().into();
    }
    let mut t = InlineTable::new();
    t.insert("id", action.as_str().into());
    for (k, v) in &spec.args {
        t.insert(k, v.as_str().into());
    }
    if let Some(scope) = &spec.scope {
        t.insert("scope", scope.as_str().into());
    }
    Value::InlineTable(t)
}

/// `keybindings.toml`에 키 하나를 현재 OS 섹션(`[keybindings.macos]` 등)으로 쓴다.
/// `action`이 None이면 `"none"`(기본 바인딩 해제)으로 쓴다. 같은 OS 섹션의 같은 키(대소문자 무시)는 값만 바꾼다.
pub fn set_user_binding(dir: &Path, platform: Platform, spec: &BindingSpec) -> Result<(), String> {
    let mut doc = read_doc(dir)?;
    let os = os_table(section(&mut doc)?, platform)?;
    let new = value_of(spec);
    match find(os, &spec.key)
        .and_then(|k| os.get_mut(&k))
        .and_then(Item::as_value_mut)
    {
        Some(old) => {
            let mut new = new;
            *new.decor_mut() = old.decor().clone();
            *old = new;
        }
        None => {
            os.insert(&spec.key, toml_edit::value(new));
        }
    }
    write_doc(dir, FILE, &doc)
}

/// 키 하나를 현재 OS 섹션과 공통 섹션에서 지워 내장 기본 바인딩으로 되돌린다. 다른 OS 섹션은 건드리지 않는다.
pub fn remove_user_binding(dir: &Path, platform: Platform, key: &str) -> Result<(), String> {
    if !dir.join(FILE).exists() {
        return Ok(());
    }
    let mut doc = read_doc(dir)?;
    let Some(root) = doc.get_mut("keybindings").and_then(Item::as_table_mut) else {
        return Ok(());
    };
    let mut removed = false;
    while let Some(k) = find(root, key) {
        removed |= root.remove(&k).is_some();
    }
    if let Some(os) = root
        .get_mut(platform.section_name())
        .and_then(Item::as_table_mut)
    {
        while let Some(k) = find(os, key) {
            removed |= os.remove(&k).is_some();
        }
    }
    if !removed {
        return Ok(());
    }
    write_doc(dir, FILE, &doc)
}

/// 옛 `config.toml`의 `[fkeys]`를 `keybindings.toml`의 공통 섹션으로 옮기고 `[fkeys]`를 지운다.
/// 빈 값은 기본 유지라 옮기지 않고, `keybindings.toml`에 같은 키가 이미 있으면(어느 섹션이든) 그 값을 둔다.
/// `[fkeys]`가 있었으면 true. 두 번 불러도 결과가 같다.
pub fn migrate_fkeys(dir: &Path) -> Result<bool, String> {
    if !dir.join("config.toml").exists() {
        return Ok(false);
    }
    let mut cfg = read_user_doc(dir)?;
    let Some(fkeys) = cfg.get("fkeys").and_then(Item::as_table_like) else {
        return Ok(false);
    };
    let entries: Vec<(String, String)> = fkeys
        .iter()
        .filter_map(|(k, v)| Some((k.to_string(), v.as_str()?.trim().to_string())))
        .filter(|(_, v)| !v.is_empty())
        .collect();
    if !entries.is_empty() {
        let mut doc = read_doc(dir)?;
        let root = section(&mut doc)?;
        let mut taken = false;
        for (key, action) in entries {
            let exists = find(root, &key).is_some()
                || OS_SECTIONS.iter().any(|os| {
                    root.get(os)
                        .and_then(Item::as_table)
                        .is_some_and(|t| find(t, &key).is_some())
                });
            if !exists {
                root.insert(&key, toml_edit::value(action));
                taken = true;
            }
        }
        if taken {
            // 공통 섹션에 항목이 생겼으니 `[keybindings]` 머리글을 찍는다.
            root.set_implicit(false);
            write_doc(dir, FILE, &doc)?;
        }
    }
    cfg.remove("fkeys");
    write_user_doc(dir, &cfg)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::load::load_dir;

    fn read(dir: &Path, name: &str) -> String {
        fs::read_to_string(dir.join(name)).unwrap_or_default()
    }

    fn spec(key: &str, action: Option<&str>) -> BindingSpec {
        BindingSpec {
            key: key.into(),
            action: action.map(Into::into),
            args: BTreeMap::new(),
            scope: None,
        }
    }

    #[test]
    fn 파일이_없으면_현재_os_섹션에_만든다() {
        let d = tempfile::tempdir().unwrap();
        set_user_binding(d.path(), Platform::Mac, &spec("F5", Some("core.move"))).unwrap();
        let loaded = load_dir(d.path(), Platform::Mac);
        assert_eq!(loaded.bindings, vec![spec("F5", Some("core.move"))]);
        assert!(load_dir(d.path(), Platform::Windows).bindings.is_empty());
    }

    #[test]
    fn 주석과_다른_항목과_다른_os_섹션을_보존한다() {
        let d = tempfile::tempdir().unwrap();
        let src = "# 내 키\n[keybindings]\n\"F2\" = \"core.rename\" # 이름\n\n[keybindings.windows]\n\"F5\" = \"core.copy\"\n\n[keybindings.macos]\n\"F5\" = \"core.copy\"\n";
        fs::write(d.path().join(FILE), src).unwrap();
        set_user_binding(d.path(), Platform::Mac, &spec("f5", Some("core.move"))).unwrap();
        let text = read(d.path(), FILE);
        assert!(text.contains("# 내 키"));
        assert!(text.contains("\"F2\" = \"core.rename\" # 이름"));
        assert!(text.contains("[keybindings.windows]\n\"F5\" = \"core.copy\""));
        assert_eq!(
            load_dir(d.path(), Platform::Mac).bindings.last(),
            Some(&spec("F5", Some("core.move")))
        );
        assert_eq!(text.matches("core.move").count(), 1);
    }

    #[test]
    fn 해제와_인수와_스코프를_쓴다() {
        let d = tempfile::tempdir().unwrap();
        set_user_binding(d.path(), Platform::Windows, &spec("F8", None)).unwrap();
        let mut s = spec("Ctrl+3", Some("core.go.shortcut"));
        s.args.insert("n".into(), "3".into());
        s.scope = Some("pane".into());
        set_user_binding(d.path(), Platform::Windows, &s).unwrap();
        let b = load_dir(d.path(), Platform::Windows).bindings;
        // 로더는 키 이름 순으로 읽는다.
        assert_eq!(b, vec![s, spec("F8", None)]);
    }

    #[test]
    fn 되돌리기는_현재_os와_공통에서만_지운다() {
        let d = tempfile::tempdir().unwrap();
        let src = "[keybindings]\n\"F5\" = \"core.move\"\n\"F2\" = \"core.rename\"\n\n[keybindings.macos]\n\"F5\" = \"core.copy\"\n\n[keybindings.windows]\n\"F5\" = \"core.copy\"\n";
        fs::write(d.path().join(FILE), src).unwrap();
        remove_user_binding(d.path(), Platform::Mac, "f5").unwrap();
        assert_eq!(
            load_dir(d.path(), Platform::Mac).bindings,
            vec![spec("F2", Some("core.rename"))]
        );
        assert!(read(d.path(), FILE).contains("[keybindings.windows]\n\"F5\" = \"core.copy\""));
        // 없는 키는 오류가 아니다.
        remove_user_binding(d.path(), Platform::Mac, "F9").unwrap();
    }

    #[test]
    fn 문법_오류가_있는_파일은_건드리지_않는다() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join(FILE), "[keybindings\n").unwrap();
        assert!(set_user_binding(d.path(), Platform::Mac, &spec("F5", None)).is_err());
        assert_eq!(read(d.path(), FILE), "[keybindings\n");
    }

    #[test]
    fn fkeys를_공통_섹션으로_옮기고_지운다() {
        let d = tempfile::tempdir().unwrap();
        fs::write(
            d.path().join("config.toml"),
            "[fkeys]\nF3 = \"core.app.launch\"\nF4 = \"\"\nF8 = \"none\"\n\"Ctrl+F5\" = \"core.move\"\n\n[fkey_apps]\n# 내 앱\nF3 = \"Code\"\n",
        )
        .unwrap();
        assert!(migrate_fkeys(d.path()).unwrap());
        let cfg = read(d.path(), "config.toml");
        assert!(!cfg.contains("fkeys]"));
        assert!(cfg.contains("# 내 앱") && cfg.contains("F3 = \"Code\""));
        let b = load_dir(d.path(), Platform::Linux).bindings;
        assert_eq!(
            b,
            vec![
                spec("Ctrl+F5", Some("core.move")),
                spec("F3", Some("core.app.launch")),
                spec("F8", None)
            ]
        );
        // 두 번째는 할 일이 없다.
        assert!(!migrate_fkeys(d.path()).unwrap());
        assert_eq!(load_dir(d.path(), Platform::Linux).bindings.len(), 3);
    }

    #[test]
    fn 이미_있는_키는_keybindings_값을_둔다() {
        let d = tempfile::tempdir().unwrap();
        fs::write(
            d.path().join("config.toml"),
            "[fkeys]\nF5 = \"core.move\"\nF6 = \"core.copy\"\n",
        )
        .unwrap();
        fs::write(
            d.path().join(FILE),
            "[keybindings.windows]\n\"f5\" = \"core.view\"\n",
        )
        .unwrap();
        migrate_fkeys(d.path()).unwrap();
        let text = read(d.path(), FILE);
        assert!(!text.contains("core.move"));
        assert!(text.contains("\"f5\" = \"core.view\""));
        assert_eq!(
            load_dir(d.path(), Platform::Mac).bindings,
            vec![spec("F6", Some("core.copy"))]
        );
    }

    #[test]
    fn fkeys가_없으면_아무것도_쓰지_않는다() {
        let d = tempfile::tempdir().unwrap();
        assert!(!migrate_fkeys(d.path()).unwrap());
        assert!(!d.path().join(FILE).exists());
        assert!(!d.path().join("config.toml").exists());
    }
}
