use std::sync::mpsc::Receiver;
use std::time::Duration;
use std::{fs, path::PathBuf, thread};

use td_watch::DirWatcher;

const WAIT: Duration = Duration::from_secs(5);

/// 감시 시작 전후의 지연된 이벤트가 검사를 오염시키지 않도록, 500ms 동안 조용해질 때까지(최대 10초) 비운다.
fn drain(rx: &Receiver<PathBuf>) {
    let end = std::time::Instant::now() + Duration::from_secs(10);
    while rx.recv_timeout(Duration::from_millis(500)).is_ok() && std::time::Instant::now() < end {}
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

/// 라우팅 규칙은 OS 이벤트 없이 결정적으로 검증한다.
/// ("이벤트가 오지 않음"을 OS 수준에서 단정하면, FSEvents가 감시 시작 직전의 일을 늦게 전달할 때 레이스가 된다.)
#[test]
fn watch_routes_only_watched_dirs() {
    use std::collections::HashMap;
    use td_watch::route_event;

    let a = PathBuf::from("/t/a");
    let dirs: HashMap<PathBuf, PathBuf> = HashMap::from([(a.clone(), PathBuf::from("/orig/a"))]);
    let p = |s: &str| vec![PathBuf::from(s)];

    assert_eq!(route_event(&dirs, &p("/t/a/x")), [&a], "직속 항목");
    assert_eq!(route_event(&dirs, &p("/t/a")), [&a], "감시 디렉터리 자신");
    assert!(route_event(&dirs, &p("/t/b/x")).is_empty(), "다른 디렉터리");
    assert!(
        route_event(&dirs, &p("/t/a/sub/x")).is_empty(),
        "더 깊은 하위는 재귀 감시가 아니므로 무시"
    );
    assert!(route_event(&dirs, &p("/t")).is_empty(), "부모 디렉터리");
    assert!(
        route_event(&dirs, &p("/t/ab/x")).is_empty(),
        "이름이 접두어만 같은 디렉터리"
    );
    let both = vec![
        PathBuf::from("/t/a/1"),
        PathBuf::from("/t/b/2"),
        PathBuf::from("/t/a/3"),
    ];
    assert_eq!(route_event(&dirs, &both).len(), 2);
    assert!(route_event(&HashMap::new(), &both).is_empty());
}

/// 실제 OS 이벤트: 감시하는 디렉터리의 변경은 원래 경로로 도착한다(양쪽에 쓰고 도착만 확인).
#[test]
fn watch_reports_the_original_path_of_the_watched_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let a = tmp.path().join("a");
    let b = tmp.path().join("b");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    let (mut w, rx) = DirWatcher::new().unwrap();
    w.watch(&a).unwrap();
    drain(&rx);
    fs::write(b.join("x"), "x").unwrap();
    fs::write(a.join("x"), "x").unwrap();
    assert_eq!(rx.recv_timeout(WAIT).unwrap(), a);
}
