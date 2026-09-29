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
    /// 생성 시각. 파일시스템이 지원하지 않으면 None.
    pub created: Option<SystemTime>,
    /// 유닉스 권한 비트(`0o755` 등). Windows에서는 None.
    pub mode: Option<u32>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ListOptions {
    pub show_hidden: bool,
}
