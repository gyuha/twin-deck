//! 아카이브 안 파일을 편집기로 열 때: 임시로 추출해 두고, 임시 파일이 바뀌면 아카이브에 되쓴다 (ARC-03).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime};

use td_vfs::{EntryKind, Vfs, VfsError, VfsPath};

use crate::composite::CompositeFs;

/// 임시 파일의 변경을 감시하며 아카이브에 되쓰는 편집 세션. 버리면 감시를 멈추고 임시 파일을 지운다.
pub struct EditSession {
    temp_path: PathBuf,
    stop: Arc<AtomicBool>,
    last_error: Arc<Mutex<Option<String>>>,
    worker: Option<JoinHandle<()>>,
    _dir: tempfile::TempDir,
}

type Stamp = (SystemTime, u64);

fn stamp(path: &Path) -> Option<Stamp> {
    let m = fs::metadata(path).ok()?;
    Some((m.modified().ok()?, m.len()))
}

impl EditSession {
    /// 편집기에 넘길 임시 파일 경로.
    pub fn temp_path(&self) -> &Path {
        &self.temp_path
    }

    /// 마지막 되쓰기가 실패했다면 그 메시지 (다음 성공 때 지워진다).
    pub fn last_error(&self) -> Option<String> {
        self.last_error.lock().unwrap().clone()
    }
}

impl Drop for EditSession {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }
}

/// `path`(아카이브 안 파일)를 임시 폴더로 추출하고 변경 감시를 시작한다. `poll`은 감시 간격이다.
/// 저장이 끝나기를 기다리려고, 변경이 감지된 뒤 한 번 더 같은 상태일 때 되쓴다.
pub fn start_edit(
    fs_: &CompositeFs,
    path: &VfsPath,
    poll: Duration,
) -> td_vfs::Result<EditSession> {
    let entry = fs_.stat(path)?;
    if entry.kind != EntryKind::File {
        return Err(VfsError::Other {
            path: path.clone(),
            message: "파일만 편집기로 열 수 있습니다".into(),
        });
    }
    let dir = tempfile::tempdir().map_err(|e| VfsError::Io {
        path: path.clone(),
        source: e,
    })?;
    let temp_path = dir.path().join(&entry.name);
    let temp_vp = VfsPath::new(temp_path.clone());
    fs_.copy_file(path, &temp_vp)?;

    let stop = Arc::new(AtomicBool::new(false));
    let last_error = Arc::new(Mutex::new(None));
    let worker = {
        let (fs_, path, temp, stop, err) = (
            fs_.clone(),
            path.clone(),
            temp_path.clone(),
            stop.clone(),
            last_error.clone(),
        );
        let mut synced = stamp(&temp);
        thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                thread::sleep(poll);
                let now = stamp(&temp);
                if now.is_none() || now == synced {
                    continue;
                }
                thread::sleep(poll);
                if stamp(&temp) != now {
                    continue;
                }
                let result = fs_.copy_file(&VfsPath::new(temp.clone()), &path);
                *err.lock().unwrap() = result.err().map(|e| e.to_string());
                synced = now;
            }
        })
    };
    Ok(EditSession {
        temp_path,
        stop,
        last_error,
        worker: Some(worker),
        _dir: dir,
    })
}
