//! 파일 작업 큐: 작업을 순서대로 하나씩 실행하고, 일시정지/재개/중단과 진행 이벤트를 제공한다.

mod job;
mod queue;

pub use job::{Item, JobId, JobInfo, JobKind, JobSpec, JobStatus};
pub use queue::{ItemHookBox, Queue, QueueEvent};
