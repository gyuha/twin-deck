use std::fs;
use std::io::Read;
use std::path::PathBuf;

use crate::symlink_error_message;
use crate::{Entry, EntryKind, FileId, Info, ListOptions, Result, Vfs, VfsError, VfsPath};

#[derive(Debug, Default, Clone, Copy)]
pub struct LocalFs;

fn is_hidden(name: &str, meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        let _ = name;
        meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0
    }
    #[cfg(not(windows))]
    {
        let _ = meta;
        name.starts_with('.')
    }
}

fn mode_of(meta: &fs::Metadata) -> Option<u32> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        Some(meta.permissions().mode() & 0o7777)
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        None
    }
}

fn file_id_of(meta: &fs::Metadata) -> Option<FileId> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Some(FileId {
            dev: meta.dev(),
            ino: meta.ino(),
            nlink: meta.nlink(),
        })
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        None
    }
}

fn to_entry(path: &VfsPath, meta: &fs::Metadata) -> Entry {
    let name = path.file_name().unwrap_or_default();
    let ft = meta.file_type();
    let kind = if ft.is_symlink() {
        EntryKind::Symlink
    } else if ft.is_dir() {
        EntryKind::Dir
    } else {
        EntryKind::File
    };
    Entry {
        hidden: is_hidden(&name, meta),
        name,
        path: path.clone(),
        kind,
        size: meta.len(),
        modified: meta.modified().ok(),
        created: meta.created().ok(),
        mode: mode_of(meta),
        file_id: file_id_of(meta),
    }
}

impl Vfs for LocalFs {
    fn list(&self, dir: &VfsPath, opts: &ListOptions) -> Result<Vec<Entry>> {
        let mut out = Vec::new();
        for item in fs::read_dir(dir.as_path()).map_err(|e| VfsError::io(dir, e))? {
            let item = item.map_err(|e| VfsError::io(dir, e))?;
            let path = VfsPath::new(item.path());
            let meta = fs::symlink_metadata(path.as_path()).map_err(|e| VfsError::io(&path, e))?;
            let entry = to_entry(&path, &meta);
            if opts.show_hidden || !entry.hidden {
                out.push(entry);
            }
        }
        Ok(out)
    }

    fn stat(&self, path: &VfsPath) -> Result<Entry> {
        let meta = retry_nfd(path.as_path(), |p| fs::symlink_metadata(p))
            .map_err(|e| VfsError::io(path, e))?;
        Ok(to_entry(path, &meta))
    }

    fn mkdir(&self, path: &VfsPath) -> Result<()> {
        if retry_nfd(path.as_path(), |p| fs::symlink_metadata(p)).is_ok() {
            return Err(VfsError::AlreadyExists(path.clone()));
        }
        retry_nfd(path.as_path(), |p| fs::create_dir_all(p)).map_err(|e| VfsError::io(path, e))
    }

    fn create_file(&self, path: &VfsPath) -> Result<()> {
        retry_nfd(path.as_path(), |p| {
            fs::OpenOptions::new().write(true).create_new(true).open(p)
        })
        .map(|_| ())
        .map_err(|e| VfsError::io(path, e))
    }

    fn rename(&self, from: &VfsPath, to: &VfsPath) -> Result<()> {
        match fs::rename(from.as_path(), to.as_path()) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                match (nfd_path(from.as_path()), nfd_path(to.as_path())) {
                    (None, None) => Err(e),
                    (f, t) => fs::rename(
                        f.as_deref().unwrap_or(from.as_path()),
                        t.as_deref().unwrap_or(to.as_path()),
                    )
                    .map_err(|_| e),
                }
            }
            r => r,
        }
        .map_err(|e| VfsError::io(from, e))
    }

    fn remove_file(&self, path: &VfsPath) -> Result<()> {
        retry_nfd(path.as_path(), |p| fs::remove_file(p)).map_err(|e| VfsError::io(path, e))
    }

    fn remove_dir_all(&self, path: &VfsPath) -> Result<()> {
        retry_nfd(path.as_path(), |p| fs::remove_dir_all(p)).map_err(|e| VfsError::io(path, e))
    }

    fn copy_file(&self, from: &VfsPath, to: &VfsPath) -> Result<u64> {
        retry_nfd(to.as_path(), |t| fs::copy(from.as_path(), t)).map_err(|e| {
            // 원본이 있는데 "찾을 수 없음"이면 없는 것은 대상 쪽(대상 폴더나 이름)이다. 원본 경로를 탓하면 원인을 잘못 짚게 된다.
            if e.kind() == std::io::ErrorKind::NotFound && from.as_path().exists() {
                VfsError::io(to, e)
            } else {
                VfsError::io(from, e)
            }
        })
    }

    fn info(&self, path: &VfsPath) -> Result<Info> {
        let meta = fs::symlink_metadata(path.as_path()).map_err(|e| VfsError::io(path, e))?;
        let entry = to_entry(path, &meta);
        let link_target = meta
            .file_type()
            .is_symlink()
            .then(|| fs::read_link(path.as_path()).ok().map(VfsPath::new))
            .flatten();
        let child_count = (entry.kind == EntryKind::Dir)
            .then(|| {
                fs::read_dir(path.as_path())
                    .ok()
                    .map(|rd| rd.count() as u64)
            })
            .flatten();
        Ok(Info {
            accessed: meta.accessed().ok(),
            link_target,
            child_count,
            entry,
        })
    }

    fn read_head(&self, path: &VfsPath, max: usize) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        fs::File::open(path.as_path())
            .and_then(|f| f.take(max as u64).read_to_end(&mut buf))
            .map_err(|e| VfsError::io(path, e))?;
        Ok(buf)
    }

    fn read_link(&self, path: &VfsPath) -> Result<VfsPath> {
        fs::read_link(path.as_path())
            .map(VfsPath::new)
            .map_err(|e| VfsError::io(path, e))
    }

    fn symlink(&self, target: &VfsPath, link: &VfsPath, target_is_dir: bool) -> Result<()> {
        #[cfg(unix)]
        let result = {
            let _ = target_is_dir;
            std::os::unix::fs::symlink(target.as_path(), link.as_path())
        };
        #[cfg(windows)]
        let result = if target_is_dir {
            std::os::windows::fs::symlink_dir(target.as_path(), link.as_path())
        } else {
            std::os::windows::fs::symlink_file(target.as_path(), link.as_path())
        };
        result.map_err(|e| {
            // 알려진 원인은 안내 문구로 바꾼다(특히 Windows의 권한 오류). 이미 있음/없음은 기존 오류 종류를 유지한다.
            let kind = e.kind();
            match e
                .raw_os_error()
                .and_then(|c| symlink_error_message(cfg!(windows), c))
            {
                Some(msg)
                    if kind != std::io::ErrorKind::AlreadyExists
                        && kind != std::io::ErrorKind::NotFound =>
                {
                    VfsError::Other {
                        path: link.clone(),
                        message: msg.to_string(),
                    }
                }
                _ => VfsError::io(link, e),
            }
        })
    }
}

/// 경로를 모두 NFD(분해형)로 바꾼 경로. 바뀐 것이 없으면 `None`.
/// macOS의 SMB 공유는 NFC(조합형) 한글 경로를 못 찾는다: 있는 항목도 "없음"으로 나오고(겹침을 못 알아본다),
/// 폴더를 읽어 목록을 캐시한 뒤에는 그 폴더 안에 파일도 못 만든다. NFD 경로로는 된다.
/// APFS는 두 형태를 같은 이름으로 다루지만 형태를 그대로 저장하는 파일 시스템도 있어, NFC가 실패했을 때만 쓴다.
#[cfg(target_os = "macos")]
fn nfd_path(path: &std::path::Path) -> Option<PathBuf> {
    use unicode_normalization::UnicodeNormalization;
    let out: PathBuf = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().nfd().collect::<String>())
        .collect();
    (out != path).then_some(out)
}

#[cfg(not(target_os = "macos"))]
fn nfd_path(_path: &std::path::Path) -> Option<PathBuf> {
    None
}

/// `op`를 `path`로 해 보고, 찾을 수 없음이면 NFD 경로로 한 번 더 한다.
fn retry_nfd<T>(
    path: &std::path::Path,
    op: impl Fn(&std::path::Path) -> std::io::Result<T>,
) -> std::io::Result<T> {
    match op(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => match nfd_path(path) {
            Some(alt) => op(&alt).map_err(|_| e),
            None => Err(e),
        },
        r => r,
    }
}
