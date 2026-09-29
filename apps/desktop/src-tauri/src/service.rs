//! Tauri에 의존하지 않는 명령 구현. commands.rs가 이 계층에 위임한다.

use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use specta::Type;
use td_ops::{ConflictPolicy, Ops, Outcome, Trasher};
use td_vfs::{sort_entries, Entry, EntryKind, ListOptions, LocalFs, Vfs, VfsPath};
use td_watch::DirWatcher;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum KindDto {
    File,
    Dir,
    Symlink,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EntryDto {
    pub name: String,
    pub path: String,
    pub kind: KindDto,
    /// 바이트 수. JS 숫자로 전달한다.
    pub size: f64,
    /// 수정 시각(epoch 밀리초). 알 수 없으면 null.
    pub modified_ms: Option<f64>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ConflictDto {
    Overwrite,
    Skip,
    Rename,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OutcomeDto {
    Done { path: String },
    Skipped,
}

impl From<ConflictDto> for ConflictPolicy {
    fn from(c: ConflictDto) -> Self {
        match c {
            ConflictDto::Overwrite => ConflictPolicy::Overwrite,
            ConflictDto::Skip => ConflictPolicy::Skip,
            ConflictDto::Rename => ConflictPolicy::Rename,
        }
    }
}

impl From<&Entry> for EntryDto {
    fn from(e: &Entry) -> Self {
        EntryDto {
            name: e.name.clone(),
            path: e.path.to_string(),
            kind: match e.kind {
                EntryKind::File => KindDto::File,
                EntryKind::Dir => KindDto::Dir,
                EntryKind::Symlink => KindDto::Symlink,
            },
            size: e.size as f64,
            modified_ms: e
                .modified
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64),
            hidden: e.hidden,
        }
    }
}

impl From<Outcome> for OutcomeDto {
    fn from(o: Outcome) -> Self {
        match o {
            Outcome::Done(p) => OutcomeDto::Done {
                path: p.to_string(),
            },
            Outcome::Skipped => OutcomeDto::Skipped,
        }
    }
}

pub type ServiceResult<T> = Result<T, String>;

fn vp(p: &str) -> VfsPath {
    VfsPath::new(PathBuf::from(p))
}

/// 파일 작업과 감시를 묶은 서비스. 앱 상태로 보관한다.
pub struct Service<T: Trasher> {
    ops: Ops<LocalFs, T>,
    watcher: Mutex<DirWatcher>,
}

impl<T: Trasher> Service<T> {
    /// 서비스와, 변경된 디렉터리 경로를 받는 수신기를 돌려준다.
    pub fn new(trasher: T) -> ServiceResult<(Self, Receiver<PathBuf>)> {
        let (watcher, rx) = DirWatcher::new().map_err(|e| e.to_string())?;
        Ok((
            Self {
                ops: Ops::new(LocalFs, trasher),
                watcher: Mutex::new(watcher),
            },
            rx,
        ))
    }

    /// 폴더 먼저, 이름순으로 정렬해서 돌려준다.
    pub fn list_dir(&self, path: &str, show_hidden: bool) -> ServiceResult<Vec<EntryDto>> {
        let mut entries = LocalFs
            .list(&vp(path), &ListOptions { show_hidden })
            .map_err(|e| e.to_string())?;
        sort_entries(&mut entries);
        Ok(entries.iter().map(EntryDto::from).collect())
    }

    pub fn mkdir(&self, path: &str) -> ServiceResult<()> {
        self.ops.mkdir(&vp(path)).map_err(|e| e.to_string())
    }

    pub fn touch(&self, path: &str) -> ServiceResult<()> {
        self.ops.touch(&vp(path)).map_err(|e| e.to_string())
    }

    pub fn detect_conflict(&self, src: &str, dest_dir: &str) -> Option<String> {
        self.ops
            .detect_conflict(&vp(src), &vp(dest_dir))
            .map(|p| p.to_string())
    }

    pub fn copy(
        &self,
        src: &str,
        dest_dir: &str,
        policy: ConflictDto,
    ) -> ServiceResult<OutcomeDto> {
        self.ops
            .copy(&vp(src), &vp(dest_dir), policy.into())
            .map(Into::into)
            .map_err(|e| e.to_string())
    }

    pub fn move_to(
        &self,
        src: &str,
        dest_dir: &str,
        policy: ConflictDto,
    ) -> ServiceResult<OutcomeDto> {
        self.ops
            .move_to(&vp(src), &vp(dest_dir), policy.into())
            .map(Into::into)
            .map_err(|e| e.to_string())
    }

    pub fn rename(&self, path: &str, new_name: &str) -> ServiceResult<String> {
        self.ops
            .rename(&vp(path), new_name)
            .map(|p| p.to_string())
            .map_err(|e| e.to_string())
    }

    pub fn trash(&self, path: &str) -> ServiceResult<()> {
        self.ops.trash(&vp(path)).map_err(|e| e.to_string())
    }

    pub fn delete_permanent(&self, path: &str) -> ServiceResult<()> {
        self.ops.delete(&vp(path)).map_err(|e| e.to_string())
    }

    pub fn watch(&self, path: &str) -> ServiceResult<()> {
        self.watcher
            .lock()
            .unwrap()
            .watch(Path::new(path))
            .map_err(|e| e.to_string())
    }

    pub fn unwatch(&self, path: &str) -> ServiceResult<()> {
        self.watcher
            .lock()
            .unwrap()
            .unwatch(Path::new(path))
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    struct FakeTrash(PathBuf);
    impl Trasher for FakeTrash {
        fn trash(&self, path: &Path) -> td_ops::Result<()> {
            std::fs::rename(path, self.0.join(path.file_name().unwrap())).unwrap();
            Ok(())
        }
    }

    fn setup() -> (
        tempfile::TempDir,
        Service<FakeTrash>,
        Receiver<PathBuf>,
        String,
    ) {
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        std::fs::create_dir(&bin).unwrap();
        let root = tmp.path().join("root");
        std::fs::create_dir(&root).unwrap();
        let (svc, rx) = Service::new(FakeTrash(bin)).unwrap();
        let root = root.to_string_lossy().into_owned();
        (tmp, svc, rx, root)
    }

    #[test]
    fn list_dir_sorts_dirs_first_and_filters_hidden() {
        let (_t, svc, _rx, root) = setup();
        svc.mkdir(&format!("{root}/zdir")).unwrap();
        svc.touch(&format!("{root}/a.txt")).unwrap();
        svc.touch(&format!("{root}/.hidden")).unwrap();
        let visible = svc.list_dir(&root, false).unwrap();
        let names: Vec<_> = visible.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["zdir", "a.txt"]);
        assert_eq!(visible[0].kind, KindDto::Dir);
        let all = svc.list_dir(&root, true).unwrap();
        assert_eq!(all.len(), 3);
        assert!(all.iter().any(|e| e.hidden && e.name == ".hidden"));
    }

    #[test]
    fn ops_delegate_and_report_errors_as_strings() {
        let (_t, svc, _rx, root) = setup();
        let a = format!("{root}/a.txt");
        svc.touch(&a).unwrap();
        assert!(svc.touch(&a).is_err());
        svc.mkdir(&format!("{root}/dest")).unwrap();
        assert_eq!(svc.detect_conflict(&a, &root), Some(a.clone()));
        let out = svc
            .copy(&a, &format!("{root}/dest"), ConflictDto::Skip)
            .unwrap();
        assert_eq!(
            out,
            OutcomeDto::Done {
                path: format!("{root}/dest/a.txt")
            }
        );
        assert_eq!(
            svc.copy(&a, &format!("{root}/dest"), ConflictDto::Skip)
                .unwrap(),
            OutcomeDto::Skipped
        );
        let renamed = svc.rename(&format!("{root}/dest/a.txt"), "b.txt").unwrap();
        assert!(renamed.ends_with("dest/b.txt"));
        svc.move_to(&renamed, &root, ConflictDto::Rename).unwrap();
        assert!(Path::new(&format!("{root}/b.txt")).exists());
        svc.trash(&format!("{root}/b.txt")).unwrap();
        svc.delete_permanent(&a).unwrap();
        assert!(svc.delete_permanent(&a).is_err());
    }

    #[test]
    fn watch_forwards_directory_changes() {
        let (_t, svc, rx, root) = setup();
        svc.watch(&root).unwrap();
        std::thread::sleep(Duration::from_millis(400));
        while rx.try_recv().is_ok() {}
        svc.touch(&format!("{root}/x")).unwrap();
        let got = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(got, PathBuf::from(&root));
        svc.unwatch(&root).unwrap();
    }
}
