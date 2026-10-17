//! 원격 세션(`td-remote`)을 `Vfs` 동작으로 옮긴다. 경로 표기와 라우팅은 ADR-0019.

use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read};
use std::sync::{Arc, RwLock};

use td_remote::{RemoteEntry, RemoteError, RemoteKind, RemoteSession};
use td_vfs::{
    remote_url, Entry, EntryKind, Info, ListOptions, RemoteLoc, Result, VfsError, VfsPath,
};

/// 끊긴 세션으로 작업할 때의 오류 문구. UI가 같은 문구로 끊김을 알아보고 "다시 연결"을 보이므로 바꾸면 UI도 맞춰야 한다.
pub const REMOTE_DISCONNECTED: &str = "원격 연결이 끊어졌습니다";

/// 열린 원격 세션들(연결 id → 세션). 복제본끼리 공유한다.
#[derive(Clone, Default)]
pub struct RemoteRegistry {
    sessions: Arc<RwLock<HashMap<String, Arc<dyn RemoteSession>>>>,
}

impl std::fmt::Debug for RemoteRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let ids: Vec<_> = self.sessions.read().unwrap().keys().cloned().collect();
        f.debug_struct("RemoteRegistry").field("ids", &ids).finish()
    }
}

impl RemoteRegistry {
    /// 같은 id가 이미 열려 있으면 바꿔 끼운다.
    pub fn insert(&self, id: &str, session: Arc<dyn RemoteSession>) {
        self.sessions
            .write()
            .unwrap()
            .insert(id.to_string(), session);
    }

    pub fn remove(&self, id: &str) -> bool {
        self.sessions.write().unwrap().remove(id).is_some()
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn RemoteSession>> {
        self.sessions.read().unwrap().get(id).cloned()
    }

    pub fn contains(&self, id: &str) -> bool {
        self.sessions.read().unwrap().contains_key(id)
    }

    fn session(&self, path: &VfsPath, loc: &RemoteLoc) -> Result<Arc<dyn RemoteSession>> {
        let session = self
            .get(&loc.id)
            .ok_or_else(|| other(path, "원격 연결이 열려 있지 않습니다"))?;
        if session.is_alive() {
            Ok(session)
        } else {
            Err(other(path, REMOTE_DISCONNECTED))
        }
    }
}

fn other(path: &VfsPath, message: impl Into<String>) -> VfsError {
    VfsError::Other {
        path: path.clone(),
        message: message.into(),
    }
}

fn map_err(path: &VfsPath, e: RemoteError) -> VfsError {
    match e {
        RemoteError::NotFound(_) => VfsError::NotFound(path.clone()),
        RemoteError::AlreadyExists(_) => VfsError::AlreadyExists(path.clone()),
        other_err => other(path, other_err.to_string()),
    }
}

fn io_err(path: &VfsPath, e: io::Error) -> VfsError {
    match e.kind() {
        io::ErrorKind::NotFound => VfsError::NotFound(path.clone()),
        io::ErrorKind::AlreadyExists => VfsError::AlreadyExists(path.clone()),
        _ => VfsError::Io {
            path: path.clone(),
            source: e,
        },
    }
}

fn entry_of(path: VfsPath, e: &RemoteEntry) -> Entry {
    Entry {
        hidden: e.name.starts_with('.'),
        name: e.name.clone(),
        path,
        kind: match e.kind {
            RemoteKind::File => EntryKind::File,
            RemoteKind::Dir => EntryKind::Dir,
            RemoteKind::Symlink => EntryKind::Symlink,
        },
        size: e.size,
        modified: e.modified,
        created: None,
        mode: None,
        file_id: None,
        link_is_dir: false,
    }
}

impl RemoteRegistry {
    pub(crate) fn list(
        &self,
        dir: &VfsPath,
        loc: &RemoteLoc,
        opts: &ListOptions,
    ) -> Result<Vec<Entry>> {
        let s = self.session(dir, loc)?;
        let mut out = Vec::new();
        for e in s.list(&loc.path).map_err(|e| map_err(dir, e))? {
            let mut e = e;
            // 파일을 가리키는 링크는 내용을 가져가도록 파일로 본다. 폴더를 가리키는 링크는 링크로 남기되 들어갈 수 있다고 알린다
            // (복사·집계가 링크를 따라 들어가면 순환 링크에서 끝나지 않는다). 대상이 없으면 링크 그대로 둔다.
            let mut link_is_dir = false;
            if e.kind == RemoteKind::Symlink {
                if let Ok(t) = s.stat(&td_remote::join(&loc.path, &e.name)) {
                    match t.kind {
                        RemoteKind::Dir => link_is_dir = true,
                        RemoteKind::File => {
                            e.kind = RemoteKind::File;
                            e.size = t.size;
                        }
                        RemoteKind::Symlink => {}
                    }
                }
            }
            let mut entry = entry_of(dir.join(&e.name), &e);
            entry.link_is_dir = link_is_dir;
            if opts.show_hidden || !entry.hidden {
                out.push(entry);
            }
        }
        Ok(out)
    }

    pub(crate) fn stat(&self, path: &VfsPath, loc: &RemoteLoc) -> Result<Entry> {
        let s = self.session(path, loc)?;
        let mut e = s.stat(&loc.path).map_err(|e| map_err(path, e))?;
        if loc.path == "/" {
            e.name = loc.id.clone();
        }
        Ok(entry_of(path.clone(), &e))
    }

    pub(crate) fn mkdir(&self, path: &VfsPath, loc: &RemoteLoc) -> Result<()> {
        let s = self.session(path, loc)?;
        s.mkdir_all(&loc.path).map_err(|e| map_err(path, e))
    }

    pub(crate) fn create_file(&self, path: &VfsPath, loc: &RemoteLoc) -> Result<()> {
        let s = self.session(path, loc)?;
        s.create_empty(&loc.path).map_err(|e| map_err(path, e))
    }

    /// 같은 연결 안에서만 이름을 바꾼다. 다른 위치로는 `CrossesDevices`로 알려 복사 후 삭제를 하게 한다.
    pub(crate) fn rename(
        &self,
        from: &VfsPath,
        a: &RemoteLoc,
        to: &VfsPath,
        b: &RemoteLoc,
    ) -> Result<()> {
        if a.id != b.id {
            return Err(VfsError::Io {
                path: from.clone(),
                source: io::ErrorKind::CrossesDevices.into(),
            });
        }
        let s = self.session(from, a)?;
        s.rename(&a.path, &b.path).map_err(|e| map_err(from, e))?;
        let _ = to;
        Ok(())
    }

    pub(crate) fn remove_file(&self, path: &VfsPath, loc: &RemoteLoc) -> Result<()> {
        let s = self.session(path, loc)?;
        s.remove_file(&loc.path).map_err(|e| map_err(path, e))
    }

    pub(crate) fn remove_dir_all(&self, path: &VfsPath, loc: &RemoteLoc) -> Result<()> {
        let s = self.session(path, loc)?;
        s.remove_dir_all(&loc.path).map_err(|e| map_err(path, e))
    }

    /// 원격 → 로컬.
    pub(crate) fn download(&self, from: &VfsPath, loc: &RemoteLoc, to: &VfsPath) -> Result<u64> {
        let s = self.session(from, loc)?;
        let mut r = s.read(&loc.path).map_err(|e| map_err(from, e))?;
        let mut out = File::create(to.as_path()).map_err(|e| io_err(to, e))?;
        let n = io::copy(&mut r, &mut out).map_err(|e| io_err(from, e))?;
        if let Ok(e) = s.stat(&loc.path) {
            if let Some(t) = e.modified {
                let _ = out.set_modified(t);
            }
        }
        Ok(n)
    }

    /// 로컬 → 원격.
    pub(crate) fn upload(&self, from: &VfsPath, to: &VfsPath, loc: &RemoteLoc) -> Result<u64> {
        let s = self.session(to, loc)?;
        let mut src = File::open(from.as_path()).map_err(|e| io_err(from, e))?;
        let mut w = s.write(&loc.path).map_err(|e| map_err(to, e))?;
        let n = io::copy(&mut src, &mut w).map_err(|e| io_err(to, e))?;
        w.finish().map_err(|e| map_err(to, e))?;
        Ok(n)
    }

    /// 원격 → 원격(다른 연결이거나 같은 연결). 클라이언트를 거쳐 흘려 보낸다.
    pub(crate) fn transfer(
        &self,
        from: &VfsPath,
        a: &RemoteLoc,
        to: &VfsPath,
        b: &RemoteLoc,
    ) -> Result<u64> {
        let src = self.session(from, a)?;
        let dst = self.session(to, b)?;
        let mut r = src.read(&a.path).map_err(|e| map_err(from, e))?;
        let mut w = dst.write(&b.path).map_err(|e| map_err(to, e))?;
        let n = io::copy(&mut r, &mut w).map_err(|e| io_err(to, e))?;
        w.finish().map_err(|e| map_err(to, e))?;
        Ok(n)
    }

    pub(crate) fn read_head(&self, path: &VfsPath, loc: &RemoteLoc, max: usize) -> Result<Vec<u8>> {
        let s = self.session(path, loc)?;
        let r = s.read(&loc.path).map_err(|e| map_err(path, e))?;
        let mut buf = Vec::new();
        r.take(max as u64)
            .read_to_end(&mut buf)
            .map_err(|e| io_err(path, e))?;
        Ok(buf)
    }

    pub(crate) fn info(&self, path: &VfsPath, loc: &RemoteLoc) -> Result<Info> {
        let entry = self.stat(path, loc)?;
        let child_count = (entry.kind == EntryKind::Dir)
            .then(|| {
                self.list(path, loc, &ListOptions { show_hidden: true })
                    .ok()
                    .map(|l| l.len() as u64)
            })
            .flatten();
        Ok(Info {
            entry,
            accessed: None,
            link_target: None,
            child_count,
        })
    }
}

/// 원격 위치의 `VfsPath`. 연결 id와 서버 경로로 만든다.
pub fn remote_path(proto: td_vfs::RemoteProto, id: &str, path: &str) -> VfsPath {
    VfsPath::new(remote_url(proto, id, path))
}
