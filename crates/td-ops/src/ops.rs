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

/// 긴 작업이 파일 단위로 진행을 알리고 중단 요청을 확인하는 지점.
pub trait Control {
    /// 파일/폴더 하나를 처리하기 직전에 호출된다.
    fn on_item(&self, path: &VfsPath);
    /// true이면 작업을 멈추고 `OpsError::Aborted`를 돌려준다.
    fn should_stop(&self) -> bool;
}

/// 진행 알림도 중단도 없는 기본 제어.
pub struct NoControl;

impl Control for NoControl {
    fn on_item(&self, _path: &VfsPath) {}
    fn should_stop(&self) -> bool {
        false
    }
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

/// 복제 이름 규칙(자체 정의, Marta의 실제 접미사는 확인하지 못했다): `a.txt` → `a copy.txt` → `a copy 2.txt`.
/// 확장자는 마지막 점 뒤이고, 맨 앞 점(`.env`)은 확장자로 보지 않는다. `taken`이 true인 이름은 건너뛴다.
pub fn duplicate_name(name: &str, taken: impl Fn(&str) -> bool) -> String {
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..)
        .map(|n| {
            if n == 1 {
                format!("{stem} copy{ext}")
            } else {
                format!("{stem} copy {n}{ext}")
            }
        })
        .find(|c| !taken(c))
        .expect("무한 반복자")
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

    fn copy_entry(&self, entry: &Entry, dest: &VfsPath, ctl: &dyn Control) -> Result<()> {
        if ctl.should_stop() {
            return Err(OpsError::Aborted);
        }
        ctl.on_item(&entry.path);
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
                    self.copy_entry(&child, &dest.join(&child.name), ctl)?;
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
        self.copy_with(src, dest_dir, policy, &NoControl)
    }

    /// `copy`와 같지만 항목마다 `ctl`로 진행을 알리고 중단 요청을 확인한다.
    pub fn copy_with(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
        ctl: &dyn Control,
    ) -> Result<Outcome> {
        self.check_not_inside(src, dest_dir)?;
        let Some(dest) = self.resolve_dest(src, dest_dir, policy)? else {
            return Ok(Outcome::Skipped);
        };
        let entry = self.vfs.stat(src)?;
        self.copy_entry(&entry, &dest, ctl)?;
        Ok(Outcome::Done(dest))
    }

    /// 복제 (OP-08): 같은 폴더에 접미사를 붙여 복사한다. 만들어진 경로를 돌려준다.
    pub fn duplicate(&self, src: &VfsPath) -> Result<VfsPath> {
        self.duplicate_with(src, &NoControl)
    }

    pub fn duplicate_with(&self, src: &VfsPath, ctl: &dyn Control) -> Result<VfsPath> {
        let name = src
            .file_name()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let dir = src
            .parent()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let entry = self.vfs.stat(src)?;
        let dest = dir.join(&duplicate_name(&name, |c| self.exists(&dir.join(c))));
        self.copy_entry(&entry, &dest, ctl)?;
        Ok(dest)
    }

    /// 이동 (OP-04). 같은 볼륨이면 rename, 실패하면 복사 후 삭제.
    pub fn move_to(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Outcome> {
        self.move_with(src, dest_dir, policy, &NoControl)
    }

    /// `move_to`와 같지만 항목마다 `ctl`로 진행을 알리고 중단 요청을 확인한다.
    pub fn move_with(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
        ctl: &dyn Control,
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
                self.copy_entry(&entry, &dest, ctl)?;
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
