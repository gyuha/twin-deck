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
    /// 파일(또는 심볼릭 링크) 하나를 다 처리한 직후에 호출된다.
    fn on_file_done(&self) {}
    /// true이면 폴더 안의 항목 하나가 실패해도 거기서 멈추지 않고 `on_error`로 알린 뒤 나머지를 계속 처리한다(작업 큐).
    /// false(기본)이면 첫 오류에서 바로 돌려준다.
    fn collects_errors(&self) -> bool {
        false
    }
    /// `collects_errors`가 true일 때 실패한 항목의 경로와 오류를 알린다.
    fn on_error(&self, _path: &VfsPath, _message: &str) {}
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

/// 기본 압축 파일 이름. 원본이 하나면 그 이름(파일은 확장자 제외), 여럿이면 압축 위치의 폴더 이름.
fn default_zip_name(sources: &[VfsPath], dest_dir: &VfsPath, first: &VfsPath) -> String {
    let base = if sources.len() == 1 {
        let name = first.file_name().unwrap_or_default();
        let is_dir = first.as_path().is_dir();
        match name.rfind('.') {
            Some(i) if i > 0 && !is_dir => name[..i].to_string(),
            _ => name,
        }
    } else {
        dest_dir
            .file_name()
            .unwrap_or_else(|| "archive".to_string())
    };
    format!("{base}.zip")
}

/// 아카이브 파일 이름에서 확장자를 뺀 추출 폴더 이름 (`a.tar.gz` → `a`, `a.zip` → `a`).
fn archive_stem(name: &str) -> String {
    let lower = name.to_lowercase();
    for suffix in [".tar.gz", ".tar.bz2", ".tgz", ".tbz2", ".tbz", ".tar"] {
        if lower.len() > suffix.len() && lower.ends_with(suffix) {
            return name[..name.len() - suffix.len()].to_string();
        }
    }
    match name.rfind('.') {
        Some(i) if i > 0 => name[..i].to_string(),
        _ => format!("{name} 추출"),
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

    /// 이미 이름이 정해진 결과물(`압축 파일`, `추출 폴더`)의 충돌 처리. `None`이면 건너뛴다.
    fn resolve_name(
        &self,
        dest_dir: &VfsPath,
        name: &str,
        policy: ConflictPolicy,
    ) -> Result<Option<VfsPath>> {
        let dest = dest_dir.join(name);
        if !self.exists(&dest) {
            return Ok(Some(dest));
        }
        match policy {
            ConflictPolicy::Skip => Ok(None),
            ConflictPolicy::Overwrite => {
                self.remove_any(&dest)?;
                Ok(Some(dest))
            }
            ConflictPolicy::Rename => {
                let mut n = 1;
                loop {
                    let candidate = dest_dir.join(&numbered(name, n));
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

    /// 항목 하나(폴더면 그 안 전부)를 복사한다. 돌려주는 값은 `ctl.collects_errors()`일 때 건너뛰고 알린 실패 개수다.
    fn copy_entry(&self, entry: &Entry, dest: &VfsPath, ctl: &dyn Control) -> Result<usize> {
        if ctl.should_stop() {
            return Err(OpsError::Aborted);
        }
        ctl.on_item(&entry.path);
        match entry.kind {
            EntryKind::File => {
                self.vfs.copy_file(&entry.path, dest)?;
                ctl.on_file_done();
            }
            EntryKind::Symlink => {
                let target = self.vfs.read_link(&entry.path)?;
                let is_dir = std::fs::metadata(entry.path.as_path())
                    .map(|m| m.is_dir())
                    .unwrap_or(false);
                self.vfs.symlink(&target, dest, is_dir)?;
                ctl.on_file_done();
            }
            EntryKind::Dir => {
                self.vfs.mkdir(dest)?;
                let opts = ListOptions { show_hidden: true };
                let mut failed = 0;
                for child in self.vfs.list(&entry.path, &opts)? {
                    match self.copy_entry(&child, &dest.join(&child.name), ctl) {
                        Ok(n) => failed += n,
                        Err(OpsError::Aborted) => return Err(OpsError::Aborted),
                        // 항목 하나가 실패해도 폴더 전체를 포기하지 않고 나머지를 계속 복사한다.
                        Err(e) if ctl.collects_errors() => {
                            ctl.on_error(&child.path, &e.to_string());
                            failed += 1;
                        }
                        Err(e) => return Err(e),
                    }
                }
                return Ok(failed);
            }
        }
        Ok(0)
    }

    /// `src` 아래의 파일 수(심볼릭 링크 포함, 폴더는 세지 않는다). 진행률의 분모로 쓴다.
    pub fn count_files(&self, src: &VfsPath) -> Result<usize> {
        let entry = self.vfs.stat(src)?;
        self.count_entry(&entry)
    }

    fn count_entry(&self, entry: &Entry) -> Result<usize> {
        if entry.kind != EntryKind::Dir {
            return Ok(1);
        }
        let opts = ListOptions { show_hidden: true };
        let mut n = 0;
        for child in self.vfs.list(&entry.path, &opts)? {
            n += self.count_entry(&child)?;
        }
        Ok(n)
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

    /// 심볼릭 링크 만들기 (OP-12): `dest_dir`에 `src`를 가리키는 링크를 만든다. 이름이 겹치면 `policy`를 따른다.
    /// 링크 대상은 `src`의 경로 그대로(절대 경로)다. Windows에서 권한이 없으면 원인과 안내가 든 오류가 된다.
    pub fn symlink(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        policy: ConflictPolicy,
    ) -> Result<Outcome> {
        let is_dir = self.vfs.stat(src)?.kind == EntryKind::Dir;
        let Some(dest) = self.resolve_dest(src, dest_dir, policy)? else {
            return Ok(Outcome::Skipped);
        };
        self.vfs.symlink(src, &dest, is_dir)?;
        Ok(Outcome::Done(dest))
    }

    /// 압축 (OP-11): `sources`(로컬 파일/폴더)를 `dest_dir`의 ZIP 하나로 묶는다. 원본은 그대로 둔다.
    /// `name`이 없으면 원본이 하나일 때 그 이름(확장자 제외), 여러 개면 `dest_dir`의 폴더 이름에 `.zip`을 붙인다.
    /// 같은 이름이 있으면 `policy`를 따른다(Rename이면 `이름 (1).zip`). 반쯤 쓴 파일은 남기지 않는다.
    pub fn compress_with(
        &self,
        sources: &[VfsPath],
        dest_dir: &VfsPath,
        name: Option<&str>,
        policy: ConflictPolicy,
        ctl: &dyn Control,
    ) -> Result<Outcome> {
        let first = sources
            .first()
            .ok_or_else(|| OpsError::InvalidName("압축할 항목이 없습니다".into()))?;
        let file_name = match name {
            Some(n) => {
                valid_name(n)?;
                n.to_string()
            }
            None => default_zip_name(sources, dest_dir, first),
        };
        let Some(dest) = self.resolve_name(dest_dir, &file_name, policy)? else {
            return Ok(Outcome::Skipped);
        };
        let paths: Vec<std::path::PathBuf> =
            sources.iter().map(|s| s.as_path().to_path_buf()).collect();
        for src in sources {
            self.vfs.stat(src)?;
        }
        td_archive::compress(&paths, dest.as_path(), &mut |p| {
            ctl.on_item(&VfsPath::new(p));
            !ctl.should_stop()
        })?;
        Ok(Outcome::Done(dest))
    }

    /// 추출 (OP-11): 로컬 아카이브 `src`를 `dest_dir` 아래의 새 폴더에 안전하게 푼다(경로 탈출, 절대 경로, 링크 거부).
    /// 폴더 이름은 `folder`, 없으면 아카이브 이름에서 확장자를 뺀 것이다. 같은 이름이 있으면 `policy`를 따른다.
    /// 중단하거나 실패하면 만들다 만 폴더를 지운다. 원본 아카이브는 그대로 둔다.
    pub fn extract_with(
        &self,
        src: &VfsPath,
        dest_dir: &VfsPath,
        folder: Option<&str>,
        policy: ConflictPolicy,
        ctl: &dyn Control,
    ) -> Result<Outcome> {
        let src_name = src
            .file_name()
            .ok_or_else(|| OpsError::InvalidName(src.to_string()))?;
        let folder_name = match folder {
            Some(n) => {
                valid_name(n)?;
                n.to_string()
            }
            None => archive_stem(&src_name),
        };
        let archive = td_archive::Archive::open(src.as_path(), &[]).or_else(|e| match e {
            // 확장자로 형식을 알 수 없으면(설정의 추가 확장자, Open As 등) 내용으로 판별한다.
            td_archive::ArchiveError::Unsupported(_) => td_archive::sniff_kind(src.as_path())
                .ok()
                .flatten()
                .map(|k| td_archive::Archive::open_as(src.as_path(), k))
                .unwrap_or(Err(e)),
            other => Err(other),
        })?;
        let Some(dest) = self.resolve_name(dest_dir, &folder_name, policy)? else {
            return Ok(Outcome::Skipped);
        };
        let result = archive.extract_all_with(dest.as_path(), &mut |name| {
            ctl.on_item(&dest.join(name));
            !ctl.should_stop()
        });
        match result {
            Ok(_) => Ok(Outcome::Done(dest)),
            Err(e) => {
                let _ = std::fs::remove_dir_all(dest.as_path());
                Err(e.into())
            }
        }
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
                // 일부라도 복사하지 못했으면 원본을 지우지 않는다(지우면 복사되지 않은 파일을 잃는다).
                let failed = self.copy_entry(&entry, &dest, ctl)?;
                if failed > 0 {
                    return Err(OpsError::PartialCopy(failed));
                }
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
        if !self.vfs.can_trash(path) {
            return Err(OpsError::Trash(format!(
                "{path}: 아카이브 안에서는 휴지통을 쓸 수 없습니다 (영구 삭제만 가능)"
            )));
        }
        self.trasher.trash(path.as_path())
    }

    /// 영구 삭제 (OP-07). 확인은 UI 책임이다.
    pub fn delete(&self, path: &VfsPath) -> Result<()> {
        self.remove_any(path)
    }

    /// 영구 삭제의 진행 단위 수. 휴지통을 쓸 수 있는 곳(로컬)은 파일 수, 아카이브 안은 한 번에 지우므로 1이다.
    pub fn delete_units(&self, path: &VfsPath) -> Result<usize> {
        if self.vfs.can_trash(path) {
            self.count_files(path)
        } else {
            Ok(1)
        }
    }

    /// `delete`와 같지만 파일마다 `ctl`로 진행을 알리고 중단 요청을 확인한다.
    /// 아카이브 안은 파일마다 압축 파일을 다시 쓰게 되므로 순회하지 않고 한 번에 지운다.
    pub fn delete_with(&self, path: &VfsPath, ctl: &dyn Control) -> Result<()> {
        if !self.vfs.can_trash(path) {
            ctl.on_item(path);
            self.remove_any(path)?;
            ctl.on_file_done();
            return Ok(());
        }
        let entry = self.vfs.stat(path)?;
        self.delete_entry(&entry, ctl)
    }

    fn delete_entry(&self, entry: &Entry, ctl: &dyn Control) -> Result<()> {
        if ctl.should_stop() {
            return Err(OpsError::Aborted);
        }
        ctl.on_item(&entry.path);
        if entry.kind == EntryKind::Dir {
            let opts = ListOptions { show_hidden: true };
            for child in self.vfs.list(&entry.path, &opts)? {
                self.delete_entry(&child, ctl)?;
            }
            self.vfs.remove_dir_all(&entry.path)?;
        } else {
            self.vfs.remove_file(&entry.path)?;
            ctl.on_file_done();
        }
        Ok(())
    }
}
