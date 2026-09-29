use td_vfs::{Entry, EntryKind, ListOptions, Vfs, VfsError, VfsPath};

use crate::{OpsError, Result, Trasher};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictPolicy {
    Overwrite,
    Skip,
    Rename,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// 작업 결과가 놓인 경로.
    Done(VfsPath),
    Skipped,
}

pub struct Ops<V: Vfs, T: Trasher> {
    vfs: V,
    trasher: T,
}

fn valid_name(name: &str) -> Result<()> {
    let bad = name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0');
    if bad {
        Err(OpsError::InvalidName(name.to_string()))
    } else {
        Ok(())
    }
}

/// `name (1).ext` 형태로 겹치지 않는 이름을 만든다.
fn numbered(name: &str, n: u32) -> String {
    match name.rfind('.') {
        Some(i) if i > 0 => format!("{} ({}){}", &name[..i], n, &name[i..]),
        _ => format!("{name} ({n})"),
    }
}

impl<V: Vfs, T: Trasher> Ops<V, T> {
    pub fn new(vfs: V, trasher: T) -> Self {
        Self { vfs, trasher }
    }

    fn exists(&self, path: &VfsPath) -> bool {
        self.vfs.stat(path).is_ok()
    }

    fn remove_any(&self, path: &VfsPath) -> Result<()> {
        match self.vfs.stat(path)?.kind {
            EntryKind::Dir => self.vfs.remove_dir_all(path)?,
            _ => self.vfs.remove_file(path)?,
        }
        Ok(())
    }

    /// 새 폴더. 중첩 경로도 만든다 (OP-01).
    pub fn mkdir(&self, path: &VfsPath) -> Result<()> {
        Ok(self.vfs.mkdir(path)?)
    }

    /// 새 0바이트 파일 (OP-02).
    pub fn touch(&self, path: &VfsPath) -> Result<()> {
        Ok(self.vfs.create_file(path)?)
    }

    /// `dest_dir` 안에서 `src`가 놓일 경로가 이미 있으면 그 경로를 돌려준다. UI가 충돌 다이얼로그를 띄울 때 쓴다.
    pub fn detect_conflict(&self, src: &VfsPath, dest_dir: &VfsPath) -> Option<VfsPath> {
        let dest = dest_dir.join(&src.file_name()?);
        self.exists(&dest).then_some(dest)
    }

    /// 충돌 정책을 적용해 실제로 쓸 경로를 정한다. `None`이면 건너뛴다.
    fn resolve_dest(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Option<VfsPath>> {
        let name = src
            .file_name()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let dest = dest_dir.join(&name);
        if !self.exists(&dest) {
            return Ok(Some(dest));
        }
        match policy {
            ConflictPolicy::Skip => Ok(None),
            ConflictPolicy::Overwrite => {
                if &dest == src {
                    return Err(OpsError::SameFile(dest));
                }
                self.remove_any(&dest)?;
                Ok(Some(dest))
            }
            ConflictPolicy::Rename => {
                let mut n = 1;
                loop {
                    let candidate = dest_dir.join(&numbered(&name, n));
                    if !self.exists(&candidate) {
                        return Ok(Some(candidate));
                    }
                    n += 1;
                }
            }
        }
    }

    fn check_not_inside(&self, src: &VfsPath, dest_dir: &VfsPath) -> Result<()> {
        if self.vfs.stat(src)?.kind == EntryKind::Dir
            && dest_dir.as_path().starts_with(src.as_path())
        {
            return Err(OpsError::DestInsideSource(dest_dir.clone()));
        }
        Ok(())
    }

    fn copy_entry(&self, entry: &Entry, dest: &VfsPath) -> Result<()> {
        match entry.kind {
            EntryKind::File => {
                self.vfs.copy_file(&entry.path, dest)?;
            }
            EntryKind::Symlink => {
                let target = self.vfs.read_link(&entry.path)?;
                let is_dir = std::fs::metadata(entry.path.as_path())
                    .map(|m| m.is_dir())
                    .unwrap_or(false);
                self.vfs.symlink(&target, dest, is_dir)?;
            }
            EntryKind::Dir => {
                self.vfs.mkdir(dest)?;
                let opts = ListOptions { show_hidden: true };
                for child in self.vfs.list(&entry.path, &opts)? {
                    self.copy_entry(&child, &dest.join(&child.name))?;
                }
            }
        }
        Ok(())
    }

    /// 복사 (OP-03). 심볼릭 링크는 링크로 복사한다.
    pub fn copy(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Outcome> {
        self.check_not_inside(src, dest_dir)?;
        let Some(dest) = self.resolve_dest(src, dest_dir, policy)? else {
            return Ok(Outcome::Skipped);
        };
        let entry = self.vfs.stat(src)?;
        self.copy_entry(&entry, &dest)?;
        Ok(Outcome::Done(dest))
    }

    /// 이동 (OP-04). 같은 볼륨이면 rename, 실패하면 복사 후 삭제.
    pub fn move_to(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Outcome> {
        self.check_not_inside(src, dest_dir)?;
        if src.parent().as_ref() == Some(dest_dir) {
            // 같은 폴더로의 이동은 아무 일도 하지 않는다.
            return Ok(Outcome::Skipped);
        }
        let Some(dest) = self.resolve_dest(src, dest_dir, policy)? else {
            return Ok(Outcome::Skipped);
        };
        match self.vfs.rename(src, &dest) {
            Ok(()) => {}
            Err(VfsError::Io { .. }) => {
                let entry = self.vfs.stat(src)?;
                self.copy_entry(&entry, &dest)?;
                self.remove_any(src)?;
            }
            Err(e) => return Err(e.into()),
        }
        Ok(Outcome::Done(dest))
    }

    /// 같은 폴더 안에서 이름 변경 (OP-05).
    pub fn rename(&self, src: &VfsPath, new_name: &str) -> Result<VfsPath> {
        valid_name(new_name)?;
        let parent = src
            .parent()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let dest = parent.join(new_name);
        if self.exists(&dest) {
            return Err(VfsError::AlreadyExists(dest).into());
        }
        self.vfs.rename(src, &dest)?;
        Ok(dest)
    }

    /// 휴지통으로 이동 (OP-06).
    pub fn trash(&self, path: &VfsPath) -> Result<()> {
        self.vfs.stat(path)?;
        self.trasher.trash(path.as_path())
    }

    /// 영구 삭제 (OP-07). 확인은 UI 책임이다.
    pub fn delete(&self, path: &VfsPath) -> Result<()> {
        self.remove_any(path)
    }
}
