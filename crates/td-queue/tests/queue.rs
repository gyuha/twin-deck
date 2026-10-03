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
            .map(|f| Item::new(d.src.join(f), Some(d.dst.clone()), ConflictPolicy::Rename))
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
        Item::new(
            a.src.join("missing"),
            Some(a.dst.clone()),
            ConflictPolicy::Skip,
        ),
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
        items: vec![Item::new(a.src.join("x"), None, ConflictPolicy::Skip)],
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
        items: vec![Item::new(a.src.join("x.txt"), None, ConflictPolicy::Skip)],
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

#[test]
fn queue_runs_compress_and_extract_jobs() {
    let a = dirs(&["one.txt", "two.txt", "three.txt"]);
    let (q, rx) = Queue::new(ops());

    // 여러 원본을 zip 하나로 (Item.extra), 이름 지정
    let mut compress = Item::new(
        a.src.join("one.txt"),
        Some(a.dst.clone()),
        ConflictPolicy::Rename,
    );
    compress.extra = vec![a.src.join("two.txt"), a.src.join("three.txt")];
    compress.name = Some("bundle.zip".into());
    let id = q.enqueue(JobSpec {
        kind: JobKind::Compress,
        items: vec![compress],
    });
    wait_for(
        &rx,
        |e| matches!(e, QueueEvent::Finished { job, .. } if *job == id),
    );
    let info = q.job(id).unwrap();
    assert_eq!(
        (info.status, info.completed, info.errors.len()),
        (JobStatus::Done, 1, 0)
    );
    assert!(a.dst.join("bundle.zip").as_path().is_file());
    assert!(
        a.src.join("one.txt").as_path().exists(),
        "원본은 지우지 않는다"
    );

    // 추출: 새 폴더 `bundle`에 세 파일
    let extract = Item::new(
        a.dst.join("bundle.zip"),
        Some(a.dst.clone()),
        ConflictPolicy::Rename,
    );
    let id = q.enqueue(JobSpec {
        kind: JobKind::Extract,
        items: vec![extract],
    });
    let mut progress = 0;
    wait_for(&rx, |e| {
        if matches!(e, QueueEvent::Progress { job, .. } if *job == id) {
            progress += 1;
        }
        matches!(e, QueueEvent::Finished { job, .. } if *job == id)
    });
    assert!(
        progress >= 3,
        "파일마다 진행 이벤트가 와야 한다: {progress}"
    );
    assert_eq!(q.job(id).unwrap().status, JobStatus::Done);
    for f in ["one.txt", "two.txt", "three.txt"] {
        assert_eq!(
            std::fs::read_to_string(a.dst.join(&format!("bundle/{f}")).as_path()).unwrap(),
            f
        );
    }

    // 실패는 항목 오류로 남고 작업은 Failed가 된다(아카이브가 아닌 파일)
    let bad = Item::new(
        a.src.join("two.txt"),
        Some(a.dst.clone()),
        ConflictPolicy::Rename,
    );
    let id = q.enqueue(JobSpec {
        kind: JobKind::Extract,
        items: vec![bad],
    });
    wait_for(
        &rx,
        |e| matches!(e, QueueEvent::Finished { job, .. } if *job == id),
    );
    let info = q.job(id).unwrap();
    assert_eq!((info.status, info.errors.len()), (JobStatus::Failed, 1));
    assert!(
        !a.dst.join("two").as_path().exists(),
        "실패한 추출은 폴더를 남기지 않는다"
    );
}

fn tree(root: &VfsPath) {
    let sub = root.as_path().join("tree/sub");
    std::fs::create_dir_all(&sub).unwrap();
    std::fs::write(root.as_path().join("tree/a.txt"), "a").unwrap();
    std::fs::write(sub.join("b.txt"), "b").unwrap();
    std::fs::write(sub.join("c.txt"), "c").unwrap();
}

#[test]
fn file_progress_counts_files_in_copied_tree() {
    let d = dirs(&[]);
    tree(&d.src);
    let (q, rx) = Queue::new(ops());
    let id = q.enqueue(copy_spec(&d, &["tree"]));
    wait_for(&rx, |e| matches!(e, QueueEvent::Finished { .. }));
    let info = q.job(id).unwrap();
    assert_eq!(info.files_total, Some(3));
    assert_eq!(info.files_done, 3);
    assert_eq!(info.completed, 1);
}

#[test]
fn file_progress_reports_each_file_as_current() {
    let d = dirs(&[]);
    tree(&d.src);
    let (q, rx) = Queue::new(ops());
    q.enqueue(copy_spec(&d, &["tree"]));
    let mut seen = Vec::new();
    wait_for(&rx, |e| {
        if let QueueEvent::Progress { path, .. } = e {
            seen.push(path.clone());
        }
        matches!(e, QueueEvent::Finished { .. })
    });
    for f in ["a.txt", "b.txt", "c.txt"] {
        assert!(seen.iter().any(|p| p.ends_with(f)), "{f} 진행 알림 없음");
    }
}

#[test]
fn file_progress_counts_moved_tree() {
    let d = dirs(&[]);
    tree(&d.src);
    let (q, rx) = Queue::new(ops());
    let mut spec = copy_spec(&d, &["tree"]);
    spec.kind = JobKind::Move;
    let id = q.enqueue(spec);
    wait_for(&rx, |e| matches!(e, QueueEvent::Finished { .. }));
    let info = q.job(id).unwrap();
    assert_eq!(info.files_total, Some(3));
    assert_eq!(info.files_done, 3);
}

#[test]
fn file_progress_is_none_for_other_kinds() {
    let d = dirs(&["x"]);
    let (q, rx) = Queue::new(ops());
    let id = q.enqueue(JobSpec {
        kind: JobKind::Duplicate,
        items: vec![Item::new(d.src.join("x"), None, ConflictPolicy::Skip)],
    });
    wait_for(&rx, |e| matches!(e, QueueEvent::Finished { .. }));
    assert_eq!(q.job(id).unwrap().files_total, None);
}

#[test]
fn file_progress_counts_deleted_tree() {
    let d = dirs(&[]);
    tree(&d.src);
    let (q, rx) = Queue::new(ops());
    let id = q.enqueue(JobSpec {
        kind: JobKind::Delete,
        items: vec![Item::new(d.src.join("tree"), None, ConflictPolicy::Skip)],
    });
    wait_for(&rx, |e| matches!(e, QueueEvent::Finished { .. }));
    let info = q.job(id).unwrap();
    assert_eq!(info.files_total, Some(3));
    assert_eq!(info.files_done, 3);
    assert_eq!(info.status, JobStatus::Done);
    assert!(!d.src.join("tree").as_path().exists());
}

#[test]
fn file_progress_counts_trashed_items() {
    let d = dirs(&["x", "y"]);
    let (q, rx) = Queue::new(ops());
    let id = q.enqueue(JobSpec {
        kind: JobKind::Trash,
        items: ["x", "y"]
            .iter()
            .map(|f| Item::new(d.src.join(f), None, ConflictPolicy::Skip))
            .collect(),
    });
    wait_for(&rx, |e| matches!(e, QueueEvent::Finished { .. }));
    let info = q.job(id).unwrap();
    assert_eq!(info.files_total, Some(2));
    assert_eq!(info.files_done, 2);
}

/// 폴더 안 파일 하나가 실패해도 나머지는 계속 복사하고, 실패한 파일은 작업 오류 목록에 남는다.
#[cfg(unix)]
#[test]
fn queue_folder_copy_continues_past_failed_child() {
    use std::os::unix::fs::PermissionsExt;

    let a = dirs(&[]);
    let d = a.src.as_path().join("d");
    std::fs::create_dir(&d).unwrap();
    for f in ["a.txt", "b.txt", "c.txt"] {
        std::fs::write(d.join(f), f).unwrap();
    }
    std::fs::set_permissions(d.join("b.txt"), std::fs::Permissions::from_mode(0o000)).unwrap(); // 읽을 수 없어 복사가 실패한다
    let (q, rx) = Queue::new(ops());
    let id = q.enqueue(copy_spec(&a, &["d"]));
    wait_for(
        &rx,
        |e| matches!(e, QueueEvent::Finished { job, .. } if *job == id),
    );
    std::fs::set_permissions(d.join("b.txt"), std::fs::Permissions::from_mode(0o644)).unwrap(); // tempdir 정리를 위해

    let job = q.job(id).unwrap();
    assert_eq!(job.status, JobStatus::Failed);
    assert_eq!(job.errors.len(), 1, "{:?}", job.errors);
    assert!(job.errors[0].0.ends_with("d/b.txt"), "{:?}", job.errors);
    // 실패한 파일 하나 때문에 폴더 전체를 포기하지 않는다: 나머지는 복사되어 있다.
    assert!(a.dst.join("d/a.txt").as_path().exists());
    assert!(a.dst.join("d/c.txt").as_path().exists());
}
