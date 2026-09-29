use std::path::Path;

use crate::{OpsError, Result};

/// 휴지통 이동을 추상화한다. 테스트는 실제 사용자 휴지통 대신 fake를 쓴다.
pub trait Trasher {
    fn trash(&self, path: &Path) -> Result<()>;
}

/// OS 휴지통을 쓰는 구현.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemTrash;

impl Trasher for SystemTrash {
    fn trash(&self, path: &Path) -> Result<()> {
        trash::delete(path).map_err(|e| OpsError::Trash(e.to_string()))
    }
}
