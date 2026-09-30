use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::VfsPath;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntryKind {
    File,
    Dir,
    Symlink,
}

/// 파일시스템 안에서 항목을 식별하는 값(유닉스의 장치·inode). 하드 링크와 볼륨 경계를 판단하는 데 쓴다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FileId {
    pub dev: u64,
    pub ino: u64,
    /// 하드 링크 수. 1보다 크면 같은 내용을 다른 이름으로도 볼 수 있다.
    pub nlink: u64,
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
    /// 유닉스에서만 채워진다(Windows 파일 ID는 아직 다루지 않는다). 아카이브 안 항목은 None.
    pub file_id: Option<FileId>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ListOptions {
    pub show_hidden: bool,
}
