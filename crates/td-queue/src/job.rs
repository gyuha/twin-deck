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
}

#[derive(Debug, Clone)]
pub struct Item {
    pub src: VfsPath,
    /// 복사/이동의 대상 폴더. 휴지통/삭제에서는 무시한다.
    pub dest_dir: Option<VfsPath>,
    pub policy: ConflictPolicy,
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
    /// 지금 처리 중인 경로.
    pub current: Option<String>,
    /// 실패한 항목: (경로, 오류 문자열)
    pub errors: Vec<(String, String)>,
}
