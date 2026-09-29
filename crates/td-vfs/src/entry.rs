use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::VfsPath;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntryKind {
    File,
    Dir,
    Symlink,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub name: String,
    pub path: VfsPath,
    pub kind: EntryKind,
    pub size: u64,
    pub modified: Option<SystemTime>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ListOptions {
    pub show_hidden: bool,
}
