//! 경로에 따라 로컬 파일시스템과 아카이브(`outer.zip!/안`, ADR-0012)로 라우팅하는 `Vfs`.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io;
use std::path::Path;
use std::sync::{Arc, RwLock};

use td_vfs::{Entry, EntryKind, Info, ListOptions, LocalFs, Result, Vfs, VfsError, VfsPath};
use unicode_normalization::UnicodeNormalization;

use crate::archive::{Archive, EntryInfo};
use crate::error::ArchiveError;
use crate::kind::sniff_kind;
use crate::path::{split_archive_path_with, ArchivePath};
use crate::writer::{edit_in_with, Source, ZipEdit};

/// 로컬 경로는 `LocalFs`로, `x.zip!/...` 경로는 아카이브로 보낸다.
/// 복제본끼리 추가 ZIP 확장자 목록을 공유하므로, 큐가 가진 복제본도 설정 변경을 바로 따른다.
#[derive(Debug, Default, Clone)]
pub struct CompositeFs {
    local: LocalFs,
    extra_zip_exts: Arc<RwLock<Vec<String>>>,
    /// "Open As"로 아카이브로 열기로 한 파일들(확장자와 무관). 세션 동안만 유지된다.
    forced: Arc<RwLock<HashSet<String>>>,
}

enum Loc {
    Local,
    Archive(ArchivePath),
}

fn nfc(s: &str) -> String {
    s.nfc().collect()
}

fn last_segment(name: &str) -> &str {
    name.rsplit('/').next().unwrap_or(name)
}

fn other(path: &VfsPath, message: impl Into<String>) -> VfsError {
    VfsError::Other {
        path: path.clone(),
        message: message.into(),
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

fn arc_err(path: &VfsPath, e: ArchiveError) -> VfsError {
    match e {
        ArchiveError::NotFound(_) => VfsError::NotFound(path.clone()),
        ArchiveError::Exists(_) => VfsError::AlreadyExists(path.clone()),
        ArchiveError::Io(e) => io_err(path, e),
        other_err => other(path, other_err.to_string()),
    }
}

fn entry_of(path: VfsPath, name: String, e: &EntryInfo) -> Entry {
    Entry {
        hidden: name.starts_with('.'),
        name,
        path,
        kind: if e.is_dir {
            EntryKind::Dir
        } else if e.is_symlink {
            EntryKind::Symlink
        } else {
            EntryKind::File
        },
        size: e.size,
        modified: e.modified,
        created: None,
        mode: e.mode,
    }
}

impl CompositeFs {
    pub fn new(extra_zip_exts: Vec<String>) -> Self {
        Self {
            local: LocalFs,
            extra_zip_exts: Arc::new(RwLock::new(extra_zip_exts)),
            forced: Arc::default(),
        }
    }

    /// 확장자와 무관하게 파일을 아카이브로 연다 (ARC-04). 내용(매직 바이트)이 아카이브가 아니면 오류.
    /// 돌려주는 경로(`파일!`)가 아카이브 루트다.
    pub fn open_as_archive(&self, path: &VfsPath) -> Result<VfsPath> {
        let p = path.as_path();
        if !p.is_file() {
            return Err(VfsError::NotFound(path.clone()));
        }
        if sniff_kind(p).map_err(|e| io_err(path, e))?.is_none() {
            return Err(other(path, "아카이브로 열 수 있는 형식이 아닙니다"));
        }
        self.forced
            .write()
            .unwrap()
            .insert(p.to_string_lossy().into_owned());
        Ok(VfsPath::new(format!("{}!", p.display())))
    }

    fn is_forced(&self, outer: &str) -> bool {
        self.forced.read().unwrap().contains(outer)
    }

    /// 설정 `file_systems.zip.additional_extensions`가 바뀌면 부른다.
    pub fn set_extra_zip_exts(&self, exts: Vec<String>) {
        *self.extra_zip_exts.write().unwrap() = exts;
    }

    fn extra(&self) -> Vec<String> {
        self.extra_zip_exts.read().unwrap().clone()
    }

    fn locate(&self, path: &VfsPath) -> Loc {
        let s = path.as_path().to_string_lossy();
        let forced = |p: &str| self.is_forced(p);
        match split_archive_path_with(&s, &self.extra(), &|p| Path::new(p).is_file(), &forced) {
            Some(ap) => Loc::Archive(ap),
            None => Loc::Local,
        }
    }

    /// 경로가 아카이브 안(또는 아카이브 루트)을 가리키는가.
    pub fn is_archive_path(&self, path: &VfsPath) -> bool {
        matches!(self.locate(path), Loc::Archive(_))
    }

    fn open(&self, path: &VfsPath, ap: &ArchivePath) -> Result<Archive> {
        let outer = Path::new(&ap.outer);
        let mut a = if self.is_forced(&ap.outer) {
            let kind = sniff_kind(outer)
                .map_err(|e| io_err(path, e))?
                .ok_or_else(|| other(path, "아카이브로 열 수 있는 형식이 아닙니다"))?;
            Archive::open_as(outer, kind)
        } else {
            Archive::open(outer, &self.extra())
        }
        .map_err(|e| arc_err(path, e))?;
        for n in &ap.nested {
            a = a
                .open_nested(n, &self.extra())
                .map_err(|e| arc_err(path, e))?;
        }
        Ok(a)
    }

    fn edit(
        &self,
        path: &VfsPath,
        ap: &ArchivePath,
        f: &mut dyn FnMut(&mut ZipEdit),
    ) -> Result<()> {
        let outer_as_zip = self.is_forced(&ap.outer);
        edit_in_with(
            Path::new(&ap.outer),
            outer_as_zip,
            &ap.nested,
            &self.extra(),
            f,
        )
        .map_err(|e| arc_err(path, e))
    }

    fn root_name(ap: &ArchivePath) -> String {
        let last = ap.nested.last().unwrap_or(&ap.outer);
        last_segment(last).to_string()
    }

    fn require_inner(path: &VfsPath, ap: &ArchivePath, what: &str) -> Result<()> {
        if ap.inner.is_empty() {
            Err(other(path, format!("아카이브 자체는 {what} 수 없습니다")))
        } else {
            Ok(())
        }
    }

    fn require_exists(&self, path: &VfsPath, ap: &ArchivePath) -> Result<()> {
        self.open(path, ap)?
            .stat(&ap.inner)
            .map(|_| ())
            .ok_or_else(|| VfsError::NotFound(path.clone()))
    }

    fn same_archive(a: &ArchivePath, b: &ArchivePath) -> bool {
        a.outer == b.outer && a.nested == b.nested
    }
}

impl Vfs for CompositeFs {
    fn list(&self, dir: &VfsPath, opts: &ListOptions) -> Result<Vec<Entry>> {
        let Loc::Archive(ap) = self.locate(dir) else {
            return self.local.list(dir, opts);
        };
        let a = self.open(dir, &ap)?;
        if !ap.inner.is_empty() && !a.stat(&ap.inner).is_some_and(|e| e.is_dir) {
            return Err(VfsError::NotFound(dir.clone()));
        }
        Ok(a.list(&ap.inner)
            .iter()
            .map(|e| {
                let name = nfc(last_segment(&e.name));
                entry_of(dir.join(&name), name, e)
            })
            .filter(|e| opts.show_hidden || !e.hidden)
            .collect())
    }

    fn stat(&self, path: &VfsPath) -> Result<Entry> {
        let Loc::Archive(ap) = self.locate(path) else {
            return self.local.stat(path);
        };
        let a = self.open(path, &ap)?;
        let e = a
            .stat(&ap.inner)
            .ok_or_else(|| VfsError::NotFound(path.clone()))?;
        let name = if ap.inner.is_empty() {
            Self::root_name(&ap)
        } else {
            nfc(last_segment(&e.name))
        };
        Ok(entry_of(path.clone(), name, &e))
    }

    fn mkdir(&self, path: &VfsPath) -> Result<()> {
        let Loc::Archive(ap) = self.locate(path) else {
            return self.local.mkdir(path);
        };
        Self::require_inner(path, &ap, "만들")?;
        if self.open(path, &ap)?.stat(&ap.inner).is_some() {
            return Err(VfsError::AlreadyExists(path.clone()));
        }
        self.edit(path, &ap, &mut |z| {
            z.add_dir(&ap.inner);
        })
    }

    fn create_file(&self, path: &VfsPath) -> Result<()> {
        let Loc::Archive(ap) = self.locate(path) else {
            return self.local.create_file(path);
        };
        Self::require_inner(path, &ap, "만들")?;
        if self.open(path, &ap)?.stat(&ap.inner).is_some() {
            return Err(VfsError::AlreadyExists(path.clone()));
        }
        self.edit(path, &ap, &mut |z| {
            z.add_file(&ap.inner, Source::Bytes(Vec::new()));
        })
    }

    fn rename(&self, from: &VfsPath, to: &VfsPath) -> Result<()> {
        match (self.locate(from), self.locate(to)) {
            (Loc::Local, Loc::Local) => self.local.rename(from, to),
            (Loc::Archive(a), Loc::Archive(b)) if Self::same_archive(&a, &b) => {
                Self::require_inner(from, &a, "옮길")?;
                Self::require_inner(to, &b, "덮어쓸")?;
                self.require_exists(from, &a)?;
                self.edit(from, &a, &mut |z| {
                    z.rename(&a.inner, &b.inner);
                })
            }
            // 파일시스템/아카이브 경계를 넘는 이동은 복사 후 삭제로 처리하도록 알린다.
            _ => Err(VfsError::Io {
                path: from.clone(),
                source: io::ErrorKind::CrossesDevices.into(),
            }),
        }
    }

    fn remove_file(&self, path: &VfsPath) -> Result<()> {
        let Loc::Archive(ap) = self.locate(path) else {
            return self.local.remove_file(path);
        };
        Self::require_inner(path, &ap, "지울")?;
        self.require_exists(path, &ap)?;
        self.edit(path, &ap, &mut |z| {
            z.remove(&ap.inner);
        })
    }

    fn remove_dir_all(&self, path: &VfsPath) -> Result<()> {
        let Loc::Archive(ap) = self.locate(path) else {
            return self.local.remove_dir_all(path);
        };
        Self::require_inner(path, &ap, "지울")?;
        self.require_exists(path, &ap)?;
        self.edit(path, &ap, &mut |z| {
            z.remove(&ap.inner);
        })
    }

    fn copy_file(&self, from: &VfsPath, to: &VfsPath) -> Result<u64> {
        match (self.locate(from), self.locate(to)) {
            (Loc::Local, Loc::Local) => self.local.copy_file(from, to),
            (Loc::Local, Loc::Archive(b)) => {
                Self::require_inner(to, &b, "덮어쓸")?;
                let size = fs::metadata(from.as_path())
                    .map_err(|e| io_err(from, e))?
                    .len();
                let src = from.as_path().to_path_buf();
                self.edit(to, &b, &mut |z| {
                    z.add_file(&b.inner, Source::Path(src.clone()));
                })?;
                Ok(size)
            }
            (Loc::Archive(a), Loc::Local) => {
                let arc = self.open(from, &a)?;
                let info = arc
                    .stat(&a.inner)
                    .ok_or_else(|| VfsError::NotFound(from.clone()))?;
                let mut out = File::create(to.as_path()).map_err(|e| io_err(to, e))?;
                let n = arc
                    .read_to(&a.inner, &mut out)
                    .map_err(|e| arc_err(from, e))?;
                apply_meta(&out, to.as_path(), &info);
                Ok(n)
            }
            (Loc::Archive(a), Loc::Archive(b)) => {
                Self::require_inner(to, &b, "덮어쓸")?;
                let arc = self.open(from, &a)?;
                let info = arc
                    .stat(&a.inner)
                    .ok_or_else(|| VfsError::NotFound(from.clone()))?;
                let scratch = tempfile::tempdir().map_err(|e| io_err(from, e))?;
                let tmp = scratch.path().join("entry");
                let mut f = File::create(&tmp).map_err(|e| io_err(from, e))?;
                let n = arc
                    .read_to(&a.inner, &mut f)
                    .map_err(|e| arc_err(from, e))?;
                apply_meta(&f, &tmp, &info);
                drop(f);
                self.edit(to, &b, &mut |z| {
                    z.add_file(&b.inner, Source::Path(tmp.clone()));
                })?;
                Ok(n)
            }
        }
    }

    fn read_head(&self, path: &VfsPath, max: usize) -> Result<Vec<u8>> {
        let Loc::Archive(ap) = self.locate(path) else {
            return self.local.read_head(path, max);
        };
        let a = self.open(path, &ap)?;
        let mut head = HeadWriter {
            buf: Vec::new(),
            max,
        };
        match a.read_to(&ap.inner, &mut head) {
            // 앞부분만 필요해서 일부러 중단한 경우
            Ok(_) | Err(ArchiveError::Io(_)) if head.buf.len() >= max => {}
            Ok(_) => {}
            Err(e) => return Err(arc_err(path, e)),
        }
        head.buf.truncate(max);
        Ok(head.buf)
    }

    fn info(&self, path: &VfsPath) -> Result<Info> {
        if !self.is_archive_path(path) {
            return self.local.info(path);
        }
        let entry = self.stat(path)?;
        let child_count = (entry.kind == EntryKind::Dir)
            .then(|| {
                self.list(path, &ListOptions { show_hidden: true })
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

    fn read_link(&self, path: &VfsPath) -> Result<VfsPath> {
        if self.is_archive_path(path) {
            return Err(other(path, "아카이브 안의 심볼릭 링크는 지원하지 않습니다"));
        }
        self.local.read_link(path)
    }

    fn symlink(&self, target: &VfsPath, link: &VfsPath, target_is_dir: bool) -> Result<()> {
        if self.is_archive_path(link) {
            return Err(other(
                link,
                "아카이브 안에는 심볼릭 링크를 만들 수 없습니다",
            ));
        }
        self.local.symlink(target, link, target_is_dir)
    }

    fn can_trash(&self, path: &VfsPath) -> bool {
        !self.is_archive_path(path)
    }
}

/// 추출한 파일에 아카이브 항목의 수정 시각과 권한을 옮긴다. 실패해도 내용은 이미 쓰였으므로 무시한다.
fn apply_meta(file: &File, path: impl AsRef<Path>, info: &EntryInfo) {
    if let Some(t) = info.modified {
        let _ = file.set_modified(t);
    }
    #[cfg(unix)]
    if let Some(mode) = info.mode {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path.as_ref(), fs::Permissions::from_mode(mode & 0o7777));
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// 앞 `max`바이트만 모으고 그다음부터는 쓰기를 거부해 추출을 일찍 멈추게 한다.
struct HeadWriter {
    buf: Vec<u8>,
    max: usize,
}

impl io::Write for HeadWriter {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        let room = self.max.saturating_sub(self.buf.len());
        if room == 0 {
            return Err(io::ErrorKind::WriteZero.into());
        }
        let n = room.min(data.len());
        self.buf.extend_from_slice(&data[..n]);
        Ok(n)
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
