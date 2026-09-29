use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use td_ops::{ConflictPolicy, Ops, Result as OpsResult, Trasher};
use td_queue::{Item, JobId, JobKind, JobSpec, JobStatus, Queue, QueueEvent};
use td_vfs::{LocalFs, VfsPath};

const WAIT: Duration = Duration::from_secs(5);

struct NoTrash;
impl Trasher for NoTrash {
    fn trash(&self, _p: &Path) -> OpsResult<()> {
        Ok(())
    }
}

fn ops() -> Ops<LocalFs, NoTrash> {
    Ops::new(LocalFs, NoTrash)
}

struct Dirs {
    _tmp: tempfile::TempDir,
    src: VfsPath,
    dst: VfsPath,
}

fn dirs(files: &[&str]) -> Dirs {
    let tmp = tempfile::tempdir().unwrap();
    let src = tmp.path().join("src");
    let dst = tmp.path().join("dst");
    std::fs::create_dir(&src).unwrap();
    std::fs::create_dir(&dst).unwrap();
    for f in files {
        std::fs::write(src.join(f), f).unwrap();
    }
    Dirs {
        src: VfsPath::new(src),
        dst: VfsPath::new(dst),
        _tmp: tmp,
    }
}

fn copy_spec(d: &Dirs, files: &[&str]) -> JobSpec {
    JobSpec {
        kind: JobKind::Copy,
        items: files
            .iter()
            .map(|f| Item {
                src: d.src.join(f),
                dest_dir: Some(d.dst.clone()),
                policy: ConflictPolicy::Rename,
            })
            .collect(),
    }
}

fn wait_for(rx: &Receiver<QueueEvent>, mut pred: impl FnMut(&QueueEvent) -> bool) {
    loop {
        let e = rx.recv_timeout(WAIT).expect("기대한 이벤트가 오지 않았다");
        if pred(&e) {
            return;
        }
    }
}

/// 항목 시작마다 허가를 기다리는 훅: 테스트가 워커의 진행을 한 걸음씩 제어한다.
fn gated() -> (Sender<()>, td_queue::ItemHookBox) {
    let (tx, rx) = mpsc::channel::<()>();
    let rx = Mutex::new(rx);
    (
        tx,
        Box::new(move |_job, _index| {
            rx.lock()
                .unwrap()
                .recv_timeout(WAIT)
                .expect("허가가 오지 않았다");
        }),
    )
}

#[test]
fn queue_sequential_order() {
    let a = dirs(&["1", "2", "3"]);
    let running = Arc::new(AtomicUsize::new(0));
    let max_running = Arc::new(AtomicUsize::new(0));
    let order: Arc<Mutex<Vec<(JobId, usize)>>> = Arc::default();
    let (r, m, o) = (running.clone(), max_running.clone(), order.clone());
    let hook: td_queue::ItemHookBox = Box::new(move |job, index| {
        let now = r.fetch_add(1, Ordering::SeqCst) + 1;
        m.fetch_max(now, Ordering::SeqCst);
        o.lock().unwrap().push((job, index));
        std::thread::sleep(Duration::from_millis(20));
        r.fetch_sub(1, Ordering::SeqCst);
    });
    let (q, rx) = Queue::with_hook(ops(), Some(hook));
    let j1 = q.enqueue(copy_spec(&a, &["1"]));
    let j2 = q.enqueue(copy_spec(&a, &["2", "3"]));
    let mut finished = Vec::new();
    while finished.len() < 2 {
        wait_for(&rx, |e| {
            if let QueueEvent::Finished { job, status } = e {
                assert_eq!(*status, JobStatus::Done);
                finished.push(*job);
                true
            } else {
                false
            }
        });
    }
    assert_eq!(finished, [j1, j2], "넣은 순서대로 끝난다");
    assert_eq!(*order.lock().unwrap(), [(j1, 0), (j2, 0), (j2, 1)]);
    assert_eq!(
        max_running.load(Ordering::SeqCst),
        1,
        "동시에 둘 이상 실행되지 않는다"
    );
    for f in ["1", "2", "3"] {
        assert!(a.dst.join(f).as_path().exists());
    }
}

#[test]
fn queue_pause_resume() {
    let a = dirs(&["1", "2", "3"]);
    let (permit, hook) = gated();
    let (q, rx) = Queue::with_hook(ops(), Some(hook));
    let id = q.enqueue(copy_spec(&a, &["1", "2", "3"]));

    permit.send(()).unwrap(); // 항목 0 실행
    wait_for(&rx, |e| matches!(e, QueueEvent::ItemDone { index: 0, .. }));
    q.pause(id); // 워커는 항목 1의 훅에서 기다리는 중
    permit.send(()).unwrap();
    wait_for(&rx, |e| matches!(e, QueueEvent::Paused(_)));
    std::thread::sleep(Duration::from_millis(200));
    assert_eq!(q.job(id).unwrap().status, JobStatus::Paused);
    assert!(
        !a.dst.join("2").as_path().exists(),
        "일시정지 중에는 다음 항목이 실행되지 않는다"
    );
    assert_eq!(q.job(id).unwrap().completed, 1);

    q.resume(id);
    permit.send(()).unwrap(); // 항목 2
    wait_for(&rx, |e| {
        matches!(
            e,
            QueueEvent::Finished {
                status: JobStatus::Done,
                ..
            }
        )
    });
    assert!(a.dst.join("2").as_path().exists() && a.dst.join("3").as_path().exists());
}

#[test]
fn queue_abort() {
    let a = dirs(&["1", "2", "3"]);
    let (permit, hook) = gated();
    let (q, rx) = Queue::with_hook(ops(), Some(hook));
    let id = q.enqueue(copy_spec(&a, &["1", "2", "3"]));
    let follower = q.enqueue(copy_spec(&a, &["3"]));

    permit.send(()).unwrap();
    wait_for(&rx, |e| matches!(e, QueueEvent::ItemDone { index: 0, .. }));
    q.abort(id);
    permit.send(()).unwrap(); // 항목 1은 훅을 통과하지만 중단 요청이 먼저 확인된다
    wait_for(&rx, |e| {
        matches!(
            e,
            QueueEvent::Finished {
                status: JobStatus::Aborted,
                ..
            }
        )
    });

    assert_eq!(q.job(id).unwrap().status, JobStatus::Aborted);
    assert!(
        a.dst.join("1").as_path().exists(),
        "이미 끝난 항목은 유지된다"
    );
    assert!(!a.dst.join("2").as_path().exists() && !a.dst.join("3").as_path().exists());

    // 중단해도 뒤의 작업은 계속된다.
    permit.send(()).unwrap();
    wait_for(
        &rx,
        |e| matches!(e, QueueEvent::Finished { job, status: JobStatus::Done } if *job == follower),
    );
    assert!(a.dst.join("3").as_path().exists());
}

#[test]
fn queue_failure_is_summarized_and_queue_continues() {
    let a = dirs(&["ok"]);
    let (q, rx) = Queue::new(ops());
    let mut spec = copy_spec(&a, &["ok"]);
    spec.items.insert(
        0,
        Item {
            src: a.src.join("missing"),
            dest_dir: Some(a.dst.clone()),
            policy: ConflictPolicy::Skip,
        },
    );
    let id = q.enqueue(spec);
    wait_for(&rx, |e| matches!(e, QueueEvent::Finished { .. }));
    let info = q.job(id).unwrap();
    assert_eq!(info.status, JobStatus::Failed);
    assert_eq!(info.completed, 2);
    assert_eq!(info.errors.len(), 1);
    assert!(info.errors[0].0.ends_with("missing"));
    assert!(a.dst.join("ok").as_path().exists());
}

#[test]
fn queue_delete_and_trash_jobs() {
    let a = dirs(&["x", "y"]);
    let (q, rx) = Queue::new(ops());
    q.enqueue(JobSpec {
        kind: JobKind::Delete,
        items: vec![Item {
            src: a.src.join("x"),
            dest_dir: None,
            policy: ConflictPolicy::Skip,
        }],
    });
    wait_for(&rx, |e| {
        matches!(
            e,
            QueueEvent::Finished {
                status: JobStatus::Done,
                ..
            }
        )
    });
    assert!(!a.src.join("x").as_path().exists());
    assert!(a.src.join("y").as_path().exists());
}

#[test]
fn queue_duplicate_job() {
    let a = dirs(&["x.txt"]);
    let (q, rx) = Queue::new(ops());
    let id = q.enqueue(JobSpec {
        kind: JobKind::Duplicate,
        items: vec![Item {
            src: a.src.join("x.txt"),
            dest_dir: None,
            policy: ConflictPolicy::Skip,
        }],
    });
    wait_for(&rx, |e| {
        matches!(
            e,
            QueueEvent::Finished {
                status: JobStatus::Done,
                ..
            }
        )
    });
    assert_eq!(q.job(id).unwrap().completed, 1);
    assert!(a.src.join("x copy.txt").as_path().exists());
    assert!(a.src.join("x.txt").as_path().exists());
}
