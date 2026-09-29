use std::collections::BTreeMap;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};

use td_ops::{Control, Ops, OpsError, Trasher};
use td_vfs::{Vfs, VfsPath};

use crate::job::{Item, JobId, JobInfo, JobKind, JobSpec, JobStatus};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QueueEvent {
    Added(JobId),
    Started(JobId),
    /// 항목(파일/폴더) 하나를 처리하기 직전.
    Progress {
        job: JobId,
        path: String,
    },
    ItemDone {
        job: JobId,
        index: usize,
    },
    ItemFailed {
        job: JobId,
        index: usize,
        error: String,
    },
    Paused(JobId),
    Resumed(JobId),
    Finished {
        job: JobId,
        status: JobStatus,
    },
}

struct JobState {
    spec: JobSpec,
    info: JobInfo,
    /// 사용자가 요청한 일시정지/중단.
    pause: bool,
    abort: bool,
}

#[derive(Default)]
struct State {
    next_id: JobId,
    /// 삽입 순서 = id 순서.
    jobs: BTreeMap<JobId, JobState>,
    shutdown: bool,
}

struct Shared {
    state: Mutex<State>,
    cv: Condvar,
    events: Mutex<Sender<QueueEvent>>,
}

impl Shared {
    fn emit(&self, e: QueueEvent) {
        let _ = self.events.lock().unwrap().send(e);
    }
}

/// 항목 실행 직전에 워커가 호출하는 훅. 테스트가 실행 순서를 결정적으로 제어할 때 쓴다.
pub type ItemHookBox = Box<dyn Fn(JobId, usize) + Send>;

pub struct Queue {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}

struct JobControl<'a> {
    shared: &'a Shared,
    job: JobId,
}

impl Control for JobControl<'_> {
    fn on_item(&self, path: &VfsPath) {
        let p = path.to_string();
        if let Some(j) = self.shared.state.lock().unwrap().jobs.get_mut(&self.job) {
            j.info.current = Some(p.clone());
        }
        self.shared.emit(QueueEvent::Progress {
            job: self.job,
            path: p,
        });
    }
    fn should_stop(&self) -> bool {
        self.shared
            .state
            .lock()
            .unwrap()
            .jobs
            .get(&self.job)
            .is_some_and(|j| j.abort)
    }
}

impl Queue {
    pub fn new<V, T>(ops: Ops<V, T>) -> (Self, Receiver<QueueEvent>)
    where
        V: Vfs + Send + 'static,
        T: Trasher + Send + 'static,
    {
        Self::with_hook(ops, None)
    }

    pub fn with_hook<V, T>(
        ops: Ops<V, T>,
        hook: Option<ItemHookBox>,
    ) -> (Self, Receiver<QueueEvent>)
    where
        V: Vfs + Send + 'static,
        T: Trasher + Send + 'static,
    {
        let (tx, rx) = mpsc::channel();
        let shared = Arc::new(Shared {
            state: Mutex::new(State::default()),
            cv: Condvar::new(),
            events: Mutex::new(tx),
        });
        let worker = {
            let shared = Arc::clone(&shared);
            thread::spawn(move || run_worker(shared, ops, hook))
        };
        (
            Self {
                shared,
                worker: Some(worker),
            },
            rx,
        )
    }

    /// 작업을 대기열 끝에 넣는다.
    pub fn enqueue(&self, spec: JobSpec) -> JobId {
        let mut st = self.shared.state.lock().unwrap();
        st.next_id += 1;
        let id = st.next_id;
        let info = JobInfo {
            id,
            kind: spec.kind,
            status: JobStatus::Queued,
            total: spec.items.len(),
            completed: 0,
            current: None,
            errors: Vec::new(),
        };
        st.jobs.insert(
            id,
            JobState {
                spec,
                info,
                pause: false,
                abort: false,
            },
        );
        drop(st);
        self.shared.emit(QueueEvent::Added(id));
        self.shared.cv.notify_all();
        id
    }

    pub fn pause(&self, id: JobId) {
        self.with_job(id, |j| {
            if !j.info.status.is_finished() {
                j.pause = true;
            }
        });
    }

    pub fn resume(&self, id: JobId) {
        let resumed = self.with_job(id, |j| {
            let was = j.pause;
            j.pause = false;
            if j.info.status == JobStatus::Paused {
                j.info.status = JobStatus::Running;
            }
            was
        });
        if resumed == Some(true) {
            self.shared.emit(QueueEvent::Resumed(id));
        }
        self.shared.cv.notify_all();
    }

    /// 남은 항목을 실행하지 않는다. 이미 끝난 항목은 그대로 둔다.
    pub fn abort(&self, id: JobId) {
        self.with_job(id, |j| {
            if !j.info.status.is_finished() {
                j.abort = true;
            }
        });
        self.shared.cv.notify_all();
    }

    pub fn jobs(&self) -> Vec<JobInfo> {
        self.shared
            .state
            .lock()
            .unwrap()
            .jobs
            .values()
            .map(|j| j.info.clone())
            .collect()
    }

    pub fn job(&self, id: JobId) -> Option<JobInfo> {
        self.shared
            .state
            .lock()
            .unwrap()
            .jobs
            .get(&id)
            .map(|j| j.info.clone())
    }

    fn with_job<R>(&self, id: JobId, f: impl FnOnce(&mut JobState) -> R) -> Option<R> {
        self.shared.state.lock().unwrap().jobs.get_mut(&id).map(f)
    }
}

impl Drop for Queue {
    fn drop(&mut self) {
        {
            let mut st = self.shared.state.lock().unwrap();
            st.shutdown = true;
            for j in st.jobs.values_mut() {
                j.abort = true;
                j.pause = false;
            }
        }
        self.shared.cv.notify_all();
        if let Some(w) = self.worker.take() {
            let _ = w.join();
        }
    }
}

fn run_worker<V, T>(shared: Arc<Shared>, ops: Ops<V, T>, hook: Option<ItemHookBox>)
where
    V: Vfs,
    T: Trasher,
{
    loop {
        // 다음 실행할 작업: 끝나지 않았고 일시정지가 아닌 가장 오래된 작업.
        let id = {
            let mut st = shared.state.lock().unwrap();
            loop {
                if st.shutdown {
                    return;
                }
                let next = st
                    .jobs
                    .iter()
                    .find(|(_, j)| !j.info.status.is_finished() && (!j.pause || j.abort))
                    .map(|(id, _)| *id);
                match next {
                    Some(id) => break id,
                    None => st = shared.cv.wait(st).unwrap(),
                }
            }
        };
        run_job(&shared, &ops, hook.as_ref(), id);
    }
}

fn run_job<V, T>(shared: &Shared, ops: &Ops<V, T>, hook: Option<&ItemHookBox>, id: JobId)
where
    V: Vfs,
    T: Trasher,
{
    let (kind, items): (JobKind, Vec<Item>) = {
        let mut st = shared.state.lock().unwrap();
        let j = st.jobs.get_mut(&id).unwrap();
        j.info.status = JobStatus::Running;
        (j.spec.kind, j.spec.items.clone())
    };
    shared.emit(QueueEvent::Started(id));

    for (index, item) in items.iter().enumerate() {
        if let Some(h) = hook {
            h(id, index);
        }
        // 일시정지 중이면 재개나 중단이 올 때까지 기다린다.
        {
            let mut st = shared.state.lock().unwrap();
            let mut announced = false;
            loop {
                let j = st.jobs.get_mut(&id).unwrap();
                if j.abort || !j.pause {
                    break;
                }
                if !announced {
                    j.info.status = JobStatus::Paused;
                    announced = true;
                    shared.emit(QueueEvent::Paused(id));
                }
                st = shared.cv.wait(st).unwrap();
            }
            let j = st.jobs.get_mut(&id).unwrap();
            if j.abort {
                j.info.status = JobStatus::Aborted;
                j.info.current = None;
                drop(st);
                shared.emit(QueueEvent::Finished {
                    job: id,
                    status: JobStatus::Aborted,
                });
                return;
            }
            j.info.status = JobStatus::Running;
        }

        let ctl = JobControl { shared, job: id };
        ctl.on_item(&item.src);
        let dest = item.dest_dir.as_ref();
        let result = match kind {
            JobKind::Copy => ops
                .copy_with(
                    &item.src,
                    dest.expect("복사에는 대상 폴더가 필요하다"),
                    item.policy,
                    &ctl,
                )
                .map(|_| ()),
            JobKind::Move => ops
                .move_with(
                    &item.src,
                    dest.expect("이동에는 대상 폴더가 필요하다"),
                    item.policy,
                    &ctl,
                )
                .map(|_| ()),
            JobKind::Trash => ops.trash(&item.src),
            JobKind::Delete => ops.delete(&item.src),
        };

        match result {
            Ok(()) => {
                bump(shared, id, None);
                shared.emit(QueueEvent::ItemDone { job: id, index });
            }
            Err(OpsError::Aborted) => {
                finish_aborted(shared, id);
                return;
            }
            Err(e) => {
                let msg = e.to_string();
                bump(shared, id, Some((item.src.to_string(), msg.clone())));
                shared.emit(QueueEvent::ItemFailed {
                    job: id,
                    index,
                    error: msg,
                });
            }
        }
    }

    let status = {
        let mut st = shared.state.lock().unwrap();
        let j = st.jobs.get_mut(&id).unwrap();
        j.info.current = None;
        j.info.status = if j.info.errors.is_empty() {
            JobStatus::Done
        } else {
            JobStatus::Failed
        };
        j.info.status
    };
    shared.emit(QueueEvent::Finished { job: id, status });
}

fn bump(shared: &Shared, id: JobId, error: Option<(String, String)>) {
    let mut st = shared.state.lock().unwrap();
    let j = st.jobs.get_mut(&id).unwrap();
    j.info.completed += 1;
    if let Some(e) = error {
        j.info.errors.push(e);
    }
}

fn finish_aborted(shared: &Shared, id: JobId) {
    {
        let mut st = shared.state.lock().unwrap();
        let j = st.jobs.get_mut(&id).unwrap();
        j.info.status = JobStatus::Aborted;
        j.info.current = None;
    }
    shared.emit(QueueEvent::Finished {
        job: id,
        status: JobStatus::Aborted,
    });
}
