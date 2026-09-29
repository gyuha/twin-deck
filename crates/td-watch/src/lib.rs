//! 디렉터리 변경 감시. 변경이 생긴 디렉터리를 디바운스해서 알린다 (목록 갱신 트리거용).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

const DEBOUNCE: Duration = Duration::from_millis(50);

#[derive(Debug, thiserror::Error)]
pub enum WatchError {
    #[error("감시 실패: {0}")]
    Notify(#[from] notify::Error),
    #[error("경로를 확인할 수 없음 {path}: {source}")]
    Path {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

pub type Result<T> = std::result::Result<T, WatchError>;

/// 감시 대상: 정규화된 경로 -> 호출자가 넘긴 원래 경로.
type Dirs = Arc<Mutex<HashMap<PathBuf, PathBuf>>>;

pub struct DirWatcher {
    watcher: RecommendedWatcher,
    dirs: Dirs,
}

impl DirWatcher {
    /// 감시자와, 변경된 디렉터리(watch에 넘긴 경로)를 받는 수신기를 만든다.
    pub fn new() -> Result<(Self, Receiver<PathBuf>)> {
        let dirs: Dirs = Arc::default();
        let (raw_tx, raw_rx) = mpsc::channel::<PathBuf>();
        let (out_tx, out_rx) = mpsc::channel::<PathBuf>();

        let cb_dirs = Arc::clone(&dirs);
        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(event) = res else { return };
            let dirs = cb_dirs.lock().unwrap();
            for p in &event.paths {
                // 항목의 부모 디렉터리, 또는 감시 디렉터리 자신의 변경.
                let hit = p
                    .parent()
                    .filter(|d| dirs.contains_key(*d))
                    .or_else(|| dirs.contains_key(p).then_some(p.as_path()));
                if let Some(d) = hit {
                    let _ = raw_tx.send(d.to_path_buf());
                }
            }
        })?;

        let map = Arc::clone(&dirs);
        thread::spawn(move || {
            while let Ok(first) = raw_rx.recv() {
                let mut pending = HashSet::from([first]);
                loop {
                    match raw_rx.recv_timeout(DEBOUNCE) {
                        Ok(p) => {
                            pending.insert(p);
                        }
                        Err(RecvTimeoutError::Timeout) => break,
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
                for canon in pending {
                    // unwatch 이후에 남은 이벤트는 버린다.
                    let original = map.lock().unwrap().get(&canon).cloned();
                    if let Some(orig) = original {
                        if out_tx.send(orig).is_err() {
                            return;
                        }
                    }
                }
            }
        });

        Ok((Self { watcher, dirs }, out_rx))
    }

    pub fn watch(&mut self, dir: &Path) -> Result<()> {
        let canon = dir.canonicalize().map_err(|source| WatchError::Path {
            path: dir.to_path_buf(),
            source,
        })?;
        self.dirs
            .lock()
            .unwrap()
            .insert(canon.clone(), dir.to_path_buf());
        self.watcher.watch(&canon, RecursiveMode::NonRecursive)?;
        Ok(())
    }

    pub fn unwatch(&mut self, dir: &Path) -> Result<()> {
        let canon = dir.canonicalize().map_err(|source| WatchError::Path {
            path: dir.to_path_buf(),
            source,
        })?;
        self.dirs.lock().unwrap().remove(&canon);
        self.watcher.unwatch(&canon)?;
        Ok(())
    }
}
