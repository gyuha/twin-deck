use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use toml::{Table, Value};

use crate::config::{Config, FavoriteDto, FavoriteLeaf, RemoteServer, SmbServer};
use crate::keybindings::{self, BindingSpec};
use crate::merge::merge_user;
use crate::themes::THEME_IDS;
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

const ENUMS: [(&str, &str, &[&str]); 9] = [
    // 내장 터미널의 셸. Windows에서만 의미가 있고(다른 OS는 `$SHELL`), apps/desktop의 Settings.tsx에 같은 목록이 있다.
    (
        "environment",
        "terminal",
        &["default", "cmd", "powershell", "gitbash"],
    ),
    // 화면 언어. 새 언어를 더하면 앱의 i18n/locales.ts에도 같은 코드를 등록한다.
    ("behavior", "language", &["ko", "en"]),
    (
        "behavior",
        "theme",
        // 이 셋 말고 apps/desktop/themes의 테마 이름(`themes::THEME_IDS`)도 허용한다(`is_allowed`).
        &["system", "light", "dark"],
    ),
    ("behavior.selection", "shift_mode", &["invert", "extend"]),
    (
        "behavior.table",
        "folder_style",
        &["none", "brackets", "parens", "slash"],
    ),
    ("behavior.table", "column_lines", &["none", "solid", "dash"]),
    ("behavior.layout", "tab_style", &["underline", "segments"]),
    ("behavior.layout", "tab_position", &["top", "bottom"]),
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

/// `behavior.theme`은 고정 목록 말고 생성된 테마 이름 목록도 받는다.
fn is_allowed(section: &str, key: &str, v: &str, allowed: &[&str]) -> bool {
    allowed.contains(&v) || ((section, key) == ("behavior", "theme") && THEME_IDS.contains(&v))
}

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
        if is_allowed(section, key, v, allowed) {
            continue;
        }
        warnings.push(Warning::new(
            "config.toml",
            format!(
                "{section}.{key}: '{v}'는 허용되지 않는 값입니다 ({}{})",
                allowed.join(", "),
                if (section, key) == ("behavior", "theme") {
                    " 또는 테마 이름(apps/desktop/themes의 파일 이름, 예: catppuccin-mocha)"
                } else {
                    ""
                }
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

/// 글자색 키(`behavior.text_color`, `text_color_dark`, `text_color_light`)는 비었거나 `#rgb`/`#rrggbb`여야 한다.
/// 아니면 비운(테마 그대로) 값으로 되돌리고 경고한다.
fn validate_text_color(merged: &mut Table, warnings: &mut Vec<Warning>) {
    let Some(behavior) = merged.get_mut("behavior").and_then(Value::as_table_mut) else {
        return;
    };
    for key in ["text_color", "text_color_dark", "text_color_light"] {
        let Some(v) = behavior.get(key).and_then(Value::as_str) else {
            continue;
        };
        let hex = v
            .strip_prefix('#')
            .is_some_and(|h| matches!(h.len(), 3 | 6) && h.chars().all(|c| c.is_ascii_hexdigit()));
        if v.is_empty() || hex {
            continue;
        }
        warnings.push(Warning::new(
            "config.toml",
            format!(
                "behavior.{key}: '{v}'는 색이 아닙니다 (#rrggbb 또는 #rgb, 비우면 테마 그대로)"
            ),
        ));
        behavior.insert(key.to_string(), Value::String(String::new()));
    }
}

/// `remote_server`의 포트 범위(1~65535)와 bind·user가 비지 않았는지 본다. 어긋나면 경고와 함께 기본값으로 되돌린다.
fn validate_remote_server(merged: &mut Table, defaults: &Table, warnings: &mut Vec<Warning>) {
    let Some(t) = merged
        .get_mut("remote_server")
        .and_then(Value::as_table_mut)
    else {
        return;
    };
    let default = |k: &str| {
        defaults
            .get("remote_server")
            .and_then(Value::as_table)
            .and_then(|d| d.get(k))
            .cloned()
    };
    let port_ok = matches!(t.get("port"), Some(Value::Integer(n)) if (1..=65535).contains(n));
    if t.contains_key("port") && !port_ok {
        warnings.push(Warning::new(
            "config.toml",
            "remote_server.port: 1~65535여야 합니다 (기본값을 씁니다)",
        ));
        if let Some(d) = default("port") {
            t.insert("port".into(), d);
        }
    }
    for key in ["bind", "user"] {
        let empty = t
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|s| s.trim().is_empty());
        if empty {
            warnings.push(Warning::new(
                "config.toml",
                format!("remote_server.{key}: 비워 둘 수 없습니다 (기본값을 씁니다)"),
            ));
            if let Some(d) = default(key) {
                t.insert(key.into(), d);
            }
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

/// `smb.servers`를 항목별로 검증한다. host나 share가 비었거나 없는 항목은 경고와 함께 빼고,
/// 빈 `name`은 `host/share`로 채운다. `user`가 없으면 빈 문자열(게스트)이다.
fn parse_smb_servers(value: Option<Value>, warnings: &mut Vec<Warning>) -> Vec<SmbServer> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let bad = |warnings: &mut Vec<Warning>, why: &str| {
            warnings.push(Warning::new(
                "config.toml",
                format!("smb.servers[{}]: {why}", i + 1),
            ));
        };
        let Some(t) = item.as_table() else {
            bad(warnings, "테이블이어야 합니다");
            continue;
        };
        let text = |k: &str| {
            t.get(k)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string()
        };
        let (host, share) = (text("host"), text("share"));
        if host.is_empty() || share.is_empty() {
            bad(warnings, "host와 share가 필요합니다");
            continue;
        }
        let name = match text("name") {
            n if n.is_empty() => format!("{host}/{share}"),
            n => n,
        };
        out.push(SmbServer {
            name,
            host,
            share,
            user: text("user"),
        });
    }
    out
}

/// `remote.servers`를 항목별로 검증한다. protocol이 `sftp`·`ftp`가 아니거나 host가 빈 항목, 포트가 범위를 벗어난 항목은
/// 경고와 함께 빼고, 빈 `name`은 `user@host`로, 없는 포트는 프로토콜 기본 포트로 채운다.
fn parse_remote_servers(value: Option<Value>, warnings: &mut Vec<Warning>) -> Vec<RemoteServer> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let bad = |warnings: &mut Vec<Warning>, why: &str| {
            warnings.push(Warning::new(
                "config.toml",
                format!("remote.servers[{}]: {why}", i + 1),
            ));
        };
        let Some(t) = item.as_table() else {
            bad(warnings, "테이블이어야 합니다");
            continue;
        };
        let text = |k: &str| {
            t.get(k)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string()
        };
        let protocol = text("protocol").to_ascii_lowercase();
        if protocol != "sftp" && protocol != "ftp" {
            bad(warnings, "protocol은 sftp 또는 ftp여야 합니다");
            continue;
        }
        let host = text("host");
        if host.is_empty() {
            bad(warnings, "host가 필요합니다");
            continue;
        }
        let default_port = if protocol == "sftp" { 22 } else { 21 };
        let port = match t.get("port") {
            None => default_port,
            Some(Value::Integer(n)) if *n == 0 => default_port,
            Some(Value::Integer(n)) if (1..=65535).contains(n) => *n as u16,
            Some(_) => {
                bad(warnings, "port는 1~65535여야 합니다");
                continue;
            }
        };
        let user = text("user");
        let name = match text("name") {
            n if n.is_empty() && user.is_empty() => host.clone(),
            n if n.is_empty() => format!("{user}@{host}"),
            n => n,
        };
        out.push(RemoteServer {
            name,
            protocol,
            host,
            port,
            user,
            base_dir: text("base_dir"),
        });
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
    validate_text_color(&mut merged, &mut warnings);
    validate_remote_server(&mut merged, &defaults, &mut warnings);
    let favorites = parse_favorites(merged.remove("favorites"), &mut warnings);
    let smb_servers = parse_smb_servers(
        merged
            .get_mut("smb")
            .and_then(Value::as_table_mut)
            .and_then(|t| t.remove("servers")),
        &mut warnings,
    );
    let remote_servers = parse_remote_servers(
        merged
            .get_mut("remote")
            .and_then(Value::as_table_mut)
            .and_then(|t| t.remove("servers")),
        &mut warnings,
    );
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
    config.smb.servers = smb_servers;
    config.remote.servers = remote_servers;

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
