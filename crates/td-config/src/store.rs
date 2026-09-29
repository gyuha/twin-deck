use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;

use td_watch::DirWatcher;

use crate::load::{load_dir, Loaded, Platform};

/// 설정 디렉터리를 감시하며 최신 유효 설정을 보관한다.
/// TOML 문법 오류가 나면 이전 유효 설정을 유지하고 경고만 갱신한다.
pub struct ConfigStore {
    current: Arc<Mutex<Loaded>>,
    dir: PathBuf,
    _watcher: DirWatcher,
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
            while changes.recv().is_ok() {
                while changes.try_recv().is_ok() {}
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
