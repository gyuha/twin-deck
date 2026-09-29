use std::time::SystemTime;

use crate::{Entry, VfsPath};

/// 파일 정보 (OP-14): 목록 항목 정보에 접근 시각, 링크 대상, 폴더의 항목 수를 더한 것.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Info {
    pub entry: Entry,
    pub accessed: Option<SystemTime>,
    /// 심볼릭 링크가 가리키는 대상.
    pub link_target: Option<VfsPath>,
    /// 폴더의 바로 아래 항목 수 (읽을 수 없으면 None). 재귀 크기는 계산하지 않는다.
    pub child_count: Option<u64>,
}
