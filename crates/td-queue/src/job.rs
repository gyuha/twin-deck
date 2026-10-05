use td_ops::ConflictPolicy;
use td_vfs::VfsPath;

pub type JobId = u64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobKind {
    Copy,
    Move,
    Trash,
    Delete,
    /// 같은 폴더에 접미사를 붙여 복사 (OP-08).
    Duplicate,
    /// 항목(`src`와 `extra`)을 대상 폴더의 ZIP 하나로 압축 (OP-11).
    Compress,
    /// 아카이브 `src`를 대상 폴더 아래 새 폴더로 추출 (OP-11).
    Extract,
}

#[derive(Debug, Clone)]
pub struct Item {
    pub src: VfsPath,
    /// 복사/이동의 대상 폴더. 휴지통/삭제에서는 무시한다.
    pub dest_dir: Option<VfsPath>,
    pub policy: ConflictPolicy,
    /// 압축할 때 `src`와 함께 묶을 다른 원본들.
    pub extra: Vec<VfsPath>,
    /// 압축 파일/추출 폴더의 이름. 없으면 원본 이름에서 정한다.
    pub name: Option<String>,
}

impl Item {
    pub fn new(src: VfsPath, dest_dir: Option<VfsPath>, policy: ConflictPolicy) -> Self {
        Self {
            src,
            dest_dir,
            policy,
            extra: Vec::new(),
            name: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct JobSpec {
    pub kind: JobKind,
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Queued,
    Running,
    Paused,
    Done,
    /// 끝났지만 실패한 항목이 있다.
    Failed,
    Aborted,
}

impl JobStatus {
    pub fn is_finished(self) -> bool {
        matches!(
            self,
            JobStatus::Done | JobStatus::Failed | JobStatus::Aborted
        )
    }
}

/// UI에 보여 주는 작업 스냅샷.
#[derive(Debug, Clone)]
pub struct JobInfo {
    pub id: JobId,
    pub kind: JobKind,
    pub status: JobStatus,
    pub total: usize,
    /// 처리가 끝난(성공 또는 실패) 항목 수.
    pub completed: usize,
    /// 복사/이동에서 처리할 전체 파일 수. 집계 전이거나 해당 없는 작업이면 `None`.
    pub files_total: Option<usize>,
    /// 처리가 끝난 파일 수.
    pub files_done: usize,
    /// 지금 복사 중인 파일의 전체 바이트. 아직 모르거나 복사/이동이 아니면 `None`.
    pub bytes_total: Option<u64>,
    /// 지금 복사 중인 파일에서 처리한 바이트.
    pub bytes_done: u64,
    /// 지금 처리 중인 경로.
    pub current: Option<String>,
    /// 실패한 항목: (경로, 오류 문자열)
    pub errors: Vec<(String, String)>,
}
