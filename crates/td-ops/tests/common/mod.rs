#![allow(dead_code)]
use std::cell::RefCell;
use std::path::{Path, PathBuf};

use td_ops::{Ops, Result, Trasher};
use td_vfs::{LocalFs, VfsPath};

/// 실제 사용자 휴지통 대신 tempdir 안의 폴더로 옮기는 fake.
pub struct FakeTrash {
    pub bin: PathBuf,
    pub trashed: RefCell<Vec<PathBuf>>,
}

impl Trasher for FakeTrash {
    fn trash(&self, path: &Path) -> Result<()> {
        let dest = self.bin.join(path.file_name().unwrap());
        std::fs::rename(path, &dest).unwrap();
        self.trashed.borrow_mut().push(path.to_path_buf());
        Ok(())
    }
}

pub struct Fixture {
    pub _tmp: tempfile::TempDir,
    pub a: VfsPath,
    pub b: VfsPath,
    pub bin: PathBuf,
    pub ops: Ops<LocalFs, FakeTrash>,
}

pub fn fixture() -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    for d in ["a", "b", "bin"] {
        std::fs::create_dir(root.join(d)).unwrap();
    }
    let bin = root.join("bin");
    let ops = Ops::new(
        LocalFs,
        FakeTrash {
            bin: bin.clone(),
            trashed: RefCell::new(vec![]),
        },
    );
    Fixture {
        a: VfsPath::new(root.join("a")),
        b: VfsPath::new(root.join("b")),
        bin,
        _tmp: tmp,
        ops,
    }
}

pub fn write(p: &VfsPath, content: &str) {
    std::fs::write(p.as_path(), content).unwrap();
}

pub fn read(p: &VfsPath) -> String {
    std::fs::read_to_string(p.as_path()).unwrap()
}
