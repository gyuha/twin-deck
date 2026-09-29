use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use toml::{Table, Value};

use crate::config::{Config, FavoriteDto, FavoriteLeaf};
use crate::keybindings::{self, BindingSpec};
use crate::merge::merge_user;
use crate::DEFAULTS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Mac,
    Windows,
    Linux,
}

impl Platform {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Platform::Mac
        } else if cfg!(windows) {
            Platform::Windows
        } else {
            Platform::Linux
        }
    }

    pub(crate) fn section_name(self) -> &'static str {
        match self {
            Platform::Mac => "macos",
            Platform::Windows => "windows",
            Platform::Linux => "linux",
        }
    }
}

/// 설정을 읽다가 만난 문제. 앱 동작을 막지 않는다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Warning {
    pub file: String,
    pub message: String,
    /// TOML 문법 오류의 위치(1부터).
    pub line: Option<u32>,
}

impl Warning {
    pub(crate) fn new(file: &str, message: impl Into<String>) -> Self {
        Self {
            file: file.to_string(),
            message: message.into(),
            line: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct Loaded {
    pub config: Config,
    pub bindings: Vec<BindingSpec>,
    pub warnings: Vec<Warning>,
}

fn defaults_table() -> Table {
    DEFAULTS
        .parse::<Table>()
        .expect("내장 기본값 default.toml이 올바른 TOML이 아니다")
}

fn default_config() -> Config {
    Value::Table(defaults_table())
        .try_into()
        .expect("내장 기본값이 Config 스키마와 맞지 않는다")
}

fn syntax_warning(file: &str, src: &str, e: &toml::de::Error) -> Warning {
    let line = e.span().map(|s| {
        src[..s.start.min(src.len())]
            .bytes()
            .filter(|b| *b == b'\n')
            .count() as u32
            + 1
    });
    Warning {
        file: file.to_string(),
        message: format!("TOML 문법 오류: {}", e.message()),
        line,
    }
}

const ENUMS: [(&str, &str, &[&str]); 2] = [
    ("behavior.selection", "shift_mode", &["invert", "extend"]),
    (
        "display",
        "size_format",
        &[
            "adaptive",
            "adaptive_kibi",
            "bytes",
            "KB",
            "MB",
            "GB",
            "TB",
            "KiB",
            "MiB",
            "GiB",
            "TiB",
        ],
    ),
];

/// 허용값이 정해진 키가 벗어나면 기본값으로 되돌리고 경고한다.
fn validate_enums(merged: &mut Table, defaults: &Table, warnings: &mut Vec<Warning>) {
    for (section, key, allowed) in ENUMS {
        let get = |t: &Table| -> Option<Table> {
            let mut cur = t.clone();
            for part in section.split('.') {
                cur = cur.get(part)?.as_table()?.clone();
            }
            Some(cur)
        };
        let Some(cur) = get(merged) else { continue };
        let Some(v) = cur.get(key).and_then(Value::as_str) else {
            continue;
        };
        if allowed.contains(&v) {
            continue;
        }
        warnings.push(Warning::new(
            "config.toml",
            format!(
                "{section}.{key}: '{v}'는 허용되지 않는 값입니다 ({})",
                allowed.join(", ")
            ),
        ));
        let default = get(defaults).and_then(|d| d.get(key).cloned());
        let mut cur = &mut *merged;
        for part in section.split('.') {
            cur = cur
                .get_mut(part)
                .and_then(Value::as_table_mut)
                .expect("섹션");
        }
        if let Some(d) = default {
            cur.insert(key.to_string(), d);
        }
    }
}

fn parse_favorites(value: Option<Value>, warnings: &mut Vec<Warning>) -> Vec<FavoriteDto> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let bad = |warnings: &mut Vec<Warning>, why: &str| {
            warnings.push(Warning::new(
                "config.toml",
                format!("favorites[{}]: {why}", i + 1),
            ));
        };
        let Some(t) = item.as_table() else {
            bad(warnings, "테이블이어야 합니다");
            continue;
        };
        let text = |t: &Table, k: &str| t.get(k).and_then(Value::as_str).map(str::to_string);
        match t.get("type").and_then(Value::as_str).unwrap_or("item") {
            "separator" => out.push(FavoriteDto {
                kind: "separator".into(),
                name: None,
                path: None,
                items: vec![],
            }),
            "item" => match (text(t, "name"), text(t, "path")) {
                (Some(name), Some(path)) => out.push(FavoriteDto {
                    kind: "item".into(),
                    name: Some(name),
                    path: Some(path),
                    items: vec![],
                }),
                _ => bad(warnings, "name과 path가 필요합니다"),
            },
            "group" => {
                let Some(name) = text(t, "name") else {
                    bad(warnings, "그룹에는 name이 필요합니다");
                    continue;
                };
                let mut leaves = Vec::new();
                for leaf in t
                    .get("items")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    match leaf
                        .as_table()
                        .and_then(|l| Some((text(l, "name")?, text(l, "path")?)))
                    {
                        Some((name, path)) => leaves.push(FavoriteLeaf { name, path }),
                        None => bad(
                            warnings,
                            "그룹 항목에는 name과 path가 필요합니다 (그룹 중첩은 한 단계까지)",
                        ),
                    }
                }
                out.push(FavoriteDto {
                    kind: "group".into(),
                    name: Some(name),
                    path: None,
                    items: leaves,
                });
            }
            other => bad(warnings, &format!("알 수 없는 type: {other}")),
        }
    }
    out
}

/// 문자열로 주어진 사용자 설정을 읽는다. `None`은 파일이 없다는 뜻이다.
pub fn load_from_strs(
    config: Option<&str>,
    keybindings: Option<&str>,
    platform: Platform,
) -> Loaded {
    let mut warnings = Vec::new();
    let defaults = defaults_table();

    let mut merged = defaults.clone();
    if let Some(src) = config {
        match src.parse::<Table>() {
            Ok(user) => merged = merge_user(&defaults, &user, "", "config.toml", &mut warnings),
            Err(e) => warnings.push(syntax_warning("config.toml", src, &e)),
        }
    }
    validate_enums(&mut merged, &defaults, &mut warnings);
    let favorites = parse_favorites(merged.remove("favorites"), &mut warnings);
    let mut config = match Value::Table(merged).try_into::<Config>() {
        Ok(c) => c,
        Err(e) => {
            warnings.push(Warning::new(
                "config.toml",
                format!("설정을 해석하지 못해 기본값을 씁니다: {e}"),
            ));
            default_config()
        }
    };
    config.favorites = favorites;

    // 컬럼 명세 검증: 잘못된 항목은 빼고 경고, name 컬럼은 항상 앞에 있다.
    let (columns, bad) = crate::columns::normalize_columns(&config.view.table.columns);
    for (spec, why) in bad {
        warnings.push(Warning::new(
            "config.toml",
            format!("view.table.columns '{spec}': {why}"),
        ));
    }
    config.view.table.columns = columns;

    let mut bindings = Vec::new();
    if let Some(src) = keybindings {
        match src.parse::<Table>() {
            Ok(root) => {
                bindings = keybindings::parse(&root, platform, "keybindings.toml", &mut warnings)
            }
            Err(e) => warnings.push(syntax_warning("keybindings.toml", src, &e)),
        }
    }

    Loaded {
        config,
        bindings,
        warnings,
    }
}

/// 설정 디렉터리(`config.toml`, `keybindings.toml`)를 읽는다. 없는 파일은 기본값으로 취급한다.
pub fn load_dir(dir: &Path, platform: Platform) -> Loaded {
    let read = |name: &str| fs::read_to_string(dir.join(name)).ok();
    load_from_strs(
        read("config.toml").as_deref(),
        read("keybindings.toml").as_deref(),
        platform,
    )
}
