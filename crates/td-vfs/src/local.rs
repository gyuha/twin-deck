use std::fs;

use crate::{Entry, EntryKind, ListOptions, Result, Vfs, VfsError, VfsPath};

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
        let meta = fs::symlink_metadata(path.as_path()).map_err(|e| VfsError::io(path, e))?;
        Ok(to_entry(path, &meta))
    }

    fn mkdir(&self, path: &VfsPath) -> Result<()> {
        if path.as_path().exists() {
            return Err(VfsError::AlreadyExists(path.clone()));
        }
        fs::create_dir_all(path.as_path()).map_err(|e| VfsError::io(path, e))
    }

    fn create_file(&self, path: &VfsPath) -> Result<()> {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path.as_path())
            .map(|_| ())
            .map_err(|e| VfsError::io(path, e))
    }

    fn rename(&self, from: &VfsPath, to: &VfsPath) -> Result<()> {
        fs::rename(from.as_path(), to.as_path()).map_err(|e| VfsError::io(from, e))
    }

    fn remove_file(&self, path: &VfsPath) -> Result<()> {
        fs::remove_file(path.as_path()).map_err(|e| VfsError::io(path, e))
    }

    fn remove_dir_all(&self, path: &VfsPath) -> Result<()> {
        fs::remove_dir_all(path.as_path()).map_err(|e| VfsError::io(path, e))
    }

    fn copy_file(&self, from: &VfsPath, to: &VfsPath) -> Result<u64> {
        fs::copy(from.as_path(), to.as_path()).map_err(|e| VfsError::io(from, e))
    }
}
