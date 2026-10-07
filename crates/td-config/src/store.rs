use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use specta::Type;
use td_watch::DirWatcher;

use crate::load::{load_dir, Loaded, Platform};

/// 설정 디렉터리를 감시하며 최신 유효 설정을 보관한다.
/// TOML 문법 오류가 나면 이전 유효 설정을 유지하고 경고만 갱신한다.
pub struct ConfigStore {
    current: Arc<Mutex<Loaded>>,
    dir: PathBuf,
    platform: Platform,
    _watcher: DirWatcher,
}

/// 파일 이벤트가 늦거나 유실돼도 설정이 반영되도록, 이 주기로 파일 상태를 직접 비교한다.
const POLL: Duration = Duration::from_secs(1);

type Signature = [Option<(SystemTime, u64)>; 2];

/// `config.toml`, `keybindings.toml`의 (수정 시각, 크기). 없으면 None.
fn signature(dir: &Path) -> Signature {
    ["config.toml", "keybindings.toml"].map(|name| {
        let meta = fs::metadata(dir.join(name)).ok()?;
        Some((meta.modified().ok()?, meta.len()))
    })
}

/// 문법 오류로 읽기에 실패한 파일이 있는지 (그 파일의 내용은 이전 값을 유지해야 한다).
fn has_syntax_error(l: &Loaded) -> bool {
    l.warnings
        .iter()
        .any(|w| w.message.starts_with("TOML 문법 오류"))
}

impl ConfigStore {
    /// 시작하며 한 번 읽고, 이후 변경이 있을 때마다 새 `Loaded`를 수신기로 보낸다.
    pub fn start(dir: &Path, platform: Platform) -> std::io::Result<(Self, Receiver<Loaded>)> {
        fs::create_dir_all(dir)?;
        let current = Arc::new(Mutex::new(load_dir(dir, platform)));
        let (mut watcher, changes) =
            DirWatcher::new().map_err(|e| std::io::Error::other(e.to_string()))?;
        watcher
            .watch(dir)
            .map_err(|e| std::io::Error::other(e.to_string()))?;

        let (tx, rx) = mpsc::channel();
        let (cur, d) = (Arc::clone(&current), dir.to_path_buf());
        thread::spawn(move || {
            let mut last = signature(&d);
            loop {
                match changes.recv_timeout(POLL) {
                    Ok(_) => while changes.try_recv().is_ok() {},
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => return,
                }
                // 이벤트가 와도 설정 파일이 그대로면 알리지 않는다. 이 폴더에는 커서·선택이 바뀔 때마다 저장하는
                // state.json도 있어서, 알리면 화면이 설정을 다시 받아 메뉴바 등을 매번 다시 만든다.
                let now = signature(&d);
                if now == last {
                    continue;
                }
                last = now;
                let mut fresh = load_dir(&d, platform);
                let mut guard = cur.lock().unwrap();
                if has_syntax_error(&fresh) {
                    // 이전 유효 설정을 유지하고 경고만 새로 반영한다.
                    fresh.config = guard.config.clone();
                    fresh.bindings = guard.bindings.clone();
                }
                *guard = fresh.clone();
                drop(guard);
                if tx.send(fresh).is_err() {
                    return;
                }
            }
        });
        Ok((
            Self {
                current,
                dir: dir.to_path_buf(),
                platform,
                _watcher: watcher,
            },
            rx,
        ))
    }

    pub fn current(&self) -> Loaded {
        self.current.lock().unwrap().clone()
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// 파일을 지금 다시 읽어 최신 설정으로 바꾸고 돌려준다. 설정 화면이 쓴 직후 변경 이벤트를 기다리지 않고 반영할 때 쓴다.
    /// 문법 오류가 있으면 감시 스레드와 같이 이전 유효 설정을 유지하고 경고만 새로 반영한다.
    pub fn refresh(&self) -> Loaded {
        let mut fresh = load_dir(&self.dir, self.platform);
        let mut guard = self.current.lock().unwrap();
        if has_syntax_error(&fresh) {
            fresh.config = guard.config.clone();
            fresh.bindings = guard.bindings.clone();
        }
        *guard = fresh.clone();
        fresh
    }
}

/// 설정 화면이 쓰는 값 하나. 배열과 테이블은 다루지 않는다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum ConfigValue {
    Bool(bool),
    Int(i32),
    Str(String),
}

/// 사용자 `config.toml`을 읽어 편집 가능한 문서로 만든다. 없으면 빈 문서. 문법 오류면 파일을 건드리지 않도록 오류.
fn read_user_doc(dir: &Path) -> Result<toml_edit::DocumentMut, String> {
    let text = match fs::read_to_string(dir.join("config.toml")) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("config.toml을 읽지 못했습니다: {e}")),
    };
    text.parse::<toml_edit::DocumentMut>()
        .map_err(|_| "config.toml에 문법 오류가 있어 설정을 바꾸지 않았습니다".to_string())
}

fn write_user_doc(dir: &Path, doc: &toml_edit::DocumentMut) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("config.toml.tmp");
    fs::write(&tmp, doc.to_string()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join("config.toml")).map_err(|e| e.to_string())
}

/// 사용자 `config.toml`의 점으로 이은 키(`behavior.table.icon_size`) 하나를 쓴다.
/// 그 키만 바꾸고 다른 키, 주석, 순서는 그대로 둔다. 문법 오류가 있는 파일은 건드리지 않고 오류를 돌려준다.
pub fn set_user_value(dir: &Path, key: &str, value: ConfigValue) -> Result<(), String> {
    let mut doc = read_user_doc(dir)?;
    let parts: Vec<&str> = key.split('.').collect();
    let (leaf, tables) = parts.split_last().ok_or("빈 키입니다")?;
    let mut table = doc.as_table_mut();
    for t in tables {
        let entry = table
            .entry(t)
            .or_insert_with(|| toml_edit::Item::Table(toml_edit::Table::new()));
        // 중간 테이블이 비어 있게 되더라도 `[a]`가 따로 찍히지 않게 암시적 테이블로 만든다.
        table = entry
            .as_table_mut()
            .ok_or_else(|| format!("{key}: {t}이(가) 테이블이 아닙니다"))?;
        table.set_implicit(true);
    }
    let v: toml_edit::Value = match value {
        ConfigValue::Bool(b) => b.into(),
        ConfigValue::Int(i) => i64::from(i).into(),
        ConfigValue::Str(s) => s.into(),
    };
    // 기존 값 뒤의 주석을 지키려고, 값만 갈아 끼우고 장식(공백, 주석)은 옮긴다.
    match table.get_mut(leaf).and_then(|i| i.as_value_mut()) {
        Some(old) => {
            let mut new = v;
            *new.decor_mut() = old.decor().clone();
            *old = new;
        }
        None => {
            table.insert(leaf, toml_edit::value(v));
        }
    }
    write_user_doc(dir, &doc)
}

/// 사용자 `config.toml`에서 키 하나를 지워 내장 기본값으로 되돌린다. 없는 키는 오류가 아니다.
/// 지운 뒤 비게 된 테이블은 함께 정리한다. 문법 오류가 있는 파일은 건드리지 않는다.
pub fn reset_user_value(dir: &Path, key: &str) -> Result<(), String> {
    let mut doc = read_user_doc(dir)?;
    let parts: Vec<&str> = key.split('.').collect();
    if !remove_key(doc.as_table_mut(), &parts) {
        return Ok(());
    }
    write_user_doc(dir, &doc)
}

/// 경로의 키를 지우고 비게 된 상위 테이블을 정리한다. 실제로 지웠으면 true.
fn remove_key(table: &mut toml_edit::Table, path: &[&str]) -> bool {
    match path {
        [] => false,
        [leaf] => table.remove(leaf).is_some(),
        [head, rest @ ..] => {
            let Some(child) = table.get_mut(head).and_then(|i| i.as_table_mut()) else {
                return false;
            };
            let removed = remove_key(child, rest);
            if removed && child.is_empty() {
                table.remove(head);
            }
            removed
        }
    }
}

/// `config.toml`의 즐겨찾기에서 경로가 `path`(변수 확장 전의 원문)인 항목 하나를 지운다. 그룹 안의 항목도 찾는다.
/// 폴더 자체는 건드리지 않는다. 없는 경로는 오류가 아니다. 문법 오류가 있는 파일은 건드리지 않는다.
pub fn remove_favorite(dir: &Path, path: &str) -> Result<(), String> {
    use toml_edit::{Item, Value};
    fn has(t: &dyn toml_edit::TableLike, path: &str) -> bool {
        t.get("path").and_then(Item::as_str) == Some(path)
    }
    fn remove_in(item: &mut Item, path: &str) -> bool {
        match item {
            Item::ArrayOfTables(a) => {
                if let Some(i) = (0..a.len()).find(|&i| a.get(i).is_some_and(|t| has(t, path))) {
                    a.remove(i);
                    return true;
                }
                a.iter_mut()
                    .any(|t| t.get_mut("items").is_some_and(|it| remove_in(it, path)))
            }
            Item::Value(Value::Array(a)) => {
                let found = a
                    .iter()
                    .position(|v| v.as_inline_table().is_some_and(|t| has(t, path)));
                if let Some(i) = found {
                    a.remove(i);
                    return true;
                }
                a.iter_mut().any(|v| {
                    v.as_inline_table_mut()
                        .and_then(|t| t.get_mut("items"))
                        .is_some_and(|val| match val {
                            Value::Array(inner) => {
                                let f = inner.iter().position(|x| {
                                    x.as_inline_table().is_some_and(|t| has(t, path))
                                });
                                f.map(|i| inner.remove(i)).is_some()
                            }
                            _ => false,
                        })
                })
            }
            _ => false,
        }
    }
    let mut doc = read_user_doc(dir)?;
    let removed = doc.get_mut("favorites").is_some_and(|f| remove_in(f, path));
    if !removed {
        return Ok(());
    }
    write_user_doc(dir, &doc)
}

/// `config.toml` 끝에 `[[favorites]]` 항목을 덧붙인다. 기존 내용과 주석은 그대로 두고,
/// 결과가 올바른 TOML이 아니면(예: 이미 `favorites = [...]`로 정의됨) 파일을 건드리지 않고 오류를 돌려준다.
pub fn append_favorite(dir: &Path, name: &str, path: &str) -> Result<(), String> {
    let file = dir.join("config.toml");
    let existing = match fs::read_to_string(&file) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("config.toml을 읽지 못했습니다: {e}")),
    };
    if existing.parse::<toml::Table>().is_err() {
        return Err("config.toml에 문법 오류가 있어 즐겨찾기를 추가하지 않았습니다".into());
    }
    let quote = |s: &str| toml::Value::String(s.to_string()).to_string();
    let sep = if existing.is_empty() || existing.ends_with('\n') {
        ""
    } else {
        "\n"
    };
    let updated = format!(
        "{existing}{sep}\n[[favorites]]\nname = {}\npath = {}\n",
        quote(name),
        quote(path)
    );
    if updated.parse::<toml::Table>().is_err() {
        return Err("favorites가 이미 다른 형식으로 정의되어 있어 추가하지 못했습니다".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("config.toml.tmp");
    fs::write(&tmp, updated).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}
