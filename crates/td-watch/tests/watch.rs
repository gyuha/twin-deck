use std::sync::mpsc::Receiver;
use std::time::Duration;
use std::{fs, path::PathBuf, thread};

use td_watch::DirWatcher;

const WAIT: Duration = Duration::from_secs(5);

fn drain(rx: &Receiver<PathBuf>) {
    thread::sleep(Duration::from_millis(400));
    while rx.try_recv().is_ok() {}
}

#[test]
fn watch_external_change() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().to_path_buf();
    let (mut w, rx) = DirWatcher::new().unwrap();
    w.watch(&dir).unwrap();
    drain(&rx);

    let d = dir.clone();
    thread::spawn(move || fs::write(d.join("a.txt"), "x").unwrap())
        .join()
        .unwrap();
    assert_eq!(rx.recv_timeout(WAIT).expect("생성 이벤트"), dir);
    drain(&rx);

    let d = dir.clone();
    thread::spawn(move || fs::rename(d.join("a.txt"), d.join("b.txt")).unwrap())
        .join()
        .unwrap();
    assert_eq!(rx.recv_timeout(WAIT).expect("이름 변경 이벤트"), dir);
    drain(&rx);

    let d = dir.clone();
    thread::spawn(move || fs::remove_file(d.join("b.txt")).unwrap())
        .join()
        .unwrap();
    assert_eq!(rx.recv_timeout(WAIT).expect("삭제 이벤트"), dir);
}

#[test]
fn watch_stops_after_unwatch() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().to_path_buf();
    let (mut w, rx) = DirWatcher::new().unwrap();
    w.watch(&dir).unwrap();
    drain(&rx);
    w.unwatch(&dir).unwrap();
    drain(&rx);

    fs::write(dir.join("late.txt"), "x").unwrap();
    assert!(rx.recv_timeout(Duration::from_millis(800)).is_err());
}

#[test]
fn watch_only_reports_watched_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let a = tmp.path().join("a");
    let b = tmp.path().join("b");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    let (mut w, rx) = DirWatcher::new().unwrap();
    w.watch(&a).unwrap();
    drain(&rx);
    fs::write(b.join("x"), "x").unwrap();
    assert!(rx.recv_timeout(Duration::from_millis(800)).is_err());
    fs::write(a.join("x"), "x").unwrap();
    assert_eq!(rx.recv_timeout(WAIT).unwrap(), a);
}
