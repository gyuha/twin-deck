use std::cell::RefCell;
use std::fs;

use td_state::*;

fn tab(path: &str) -> TabSnap {
    TabSnap {
        path: path.into(),
        cursor_name: Some("b.md".into()),
        selection: vec![format!("{path}/a.txt")],
        sort: Some(SortSnap {
            key: "size".into(),
            dir: "desc".into(),
        }),
        view: ViewSnap {
            mode: "columns".into(),
            count: 2,
        },
    }
}

fn sample() -> Snapshot {
    Snapshot {
        version: VERSION,
        active_pane: "right".into(),
        show_hidden: true,
        palette_query: "복제".into(),
        split: 500,
        left: PaneSnap {
            tabs: vec![tab("/home/a"), tab("/home/a/docs")],
            active: 1,
        },
        right: PaneSnap {
            tabs: vec![tab("/home/b")],
            active: 0,
        },
    }
}

#[test]
fn state_snapshot_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("cfg"); // 없는 폴더도 만들어진다
    assert_eq!(
        load(&dir, "main"),
        LoadedState {
            snapshot: None,
            warning: None
        },
        "파일이 없으면 조용히 None"
    );

    save(&dir, "main", &sample()).unwrap();
    let got = load(&dir, "main");
    assert_eq!(got.snapshot, Some(sample()));
    assert_eq!(got.warning, None);

    // 원자적 쓰기: 임시 파일이 남지 않고, 덮어써도 온전하다
    let mut changed = sample();
    changed.left.active = 0;
    changed.palette_query = "x".into();
    save(&dir, "main", &changed).unwrap();
    assert_eq!(load(&dir, "main").snapshot, Some(changed));
    let names: Vec<String> = fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, ["state.json"], "tmp 파일이 남지 않는다");

    // 창마다 파일이 따로다
    let mut other = sample();
    other.active_pane = "left".into();
    save(&dir, "win-2", &other).unwrap();
    assert_eq!(load(&dir, "win-2").snapshot.unwrap().active_pane, "left");
    assert_eq!(
        load(&dir, "main").snapshot.unwrap().left.active,
        0,
        "main은 그대로"
    );
    assert!(dir.join("state-win-2.json").exists());
    // 레이블은 파일 이름에 안전하게 쓰인다
    save(&dir, "../evil/x", &sample()).unwrap();
    assert!(dir.join("state-___evil_x.json").exists() && !tmp.path().join("evil").exists());
}

#[test]
fn state_snapshot_bad_files_fall_back_with_warning() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    let file = dir.join("state.json");

    fs::write(&file, "{ not json").unwrap();
    let l = load(dir, "main");
    assert_eq!(l.snapshot, None);
    assert!(l.warning.unwrap().contains("state.json"));

    // 호환되지 않는 버전
    let mut s = sample();
    s.version = VERSION + 1;
    fs::write(&file, serde_json::to_string(&s).unwrap()).unwrap();
    assert!(load(dir, "main").warning.unwrap().contains("버전"));

    // 구조가 맞지 않음: 탭 없음, 활성 탭 범위 초과, 알 수 없는 패널
    for mutate in [
        (|s: &mut Snapshot| s.left.tabs.clear()) as fn(&mut Snapshot),
        |s| s.right.active = 5,
        |s| s.active_pane = "middle".into(),
    ] {
        let mut s = sample();
        mutate(&mut s);
        fs::write(&file, serde_json::to_string(&s).unwrap()).unwrap();
        let l = load(dir, "main");
        assert_eq!(l.snapshot, None);
        assert!(l.warning.is_some());
    }

    // 필드가 빠진 옛 파일
    fs::write(&file, r#"{"version":1}"#).unwrap();
    assert!(load(dir, "main").warning.is_some());

    // 손상된 파일이 있어도 새로 저장하면 정상으로 돌아온다
    save(dir, "main", &sample()).unwrap();
    assert_eq!(load(dir, "main").snapshot, Some(sample()));
}

#[test]
fn state_reset_removes_only_state_files() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    save(dir, "main", &sample()).unwrap();
    save(dir, "win-2", &sample()).unwrap();
    fs::write(dir.join("config.toml"), "x").unwrap();
    fs::write(dir.join("keybindings.toml"), "y").unwrap();
    fs::write(dir.join("statement.json"), "z").unwrap(); // 접두어만 비슷한 파일
    assert_eq!(reset(dir).unwrap(), 2);
    assert_eq!(load(dir, "main").snapshot, None);
    assert!(
        dir.join("config.toml").exists()
            && dir.join("keybindings.toml").exists()
            && dir.join("statement.json").exists()
    );
    assert_eq!(reset(dir).unwrap(), 0);
    assert_eq!(
        reset(&dir.join("nope")).unwrap(),
        0,
        "없는 폴더도 오류가 아니다"
    );
}

#[test]
fn window_labels_unique() {
    let none: Vec<String> = vec![];
    assert_eq!(next_window_label(&none), "win-2");
    let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    assert_eq!(next_window_label(&s(&["main"])), "win-2");
    assert_eq!(next_window_label(&s(&["main", "win-2"])), "win-3");
    assert_eq!(
        next_window_label(&s(&["main", "win-3"])),
        "win-2",
        "닫힌 번호는 재사용"
    );
    assert_eq!(next_window_label(&s(&["win-2", "win-3", "win-4"])), "win-5");

    // capability 패턴
    assert!(pattern_matches("main", "main"));
    assert!(!pattern_matches("main", "main2"));
    assert!(pattern_matches("win-*", "win-2"));
    assert!(!pattern_matches("win-*", "main"));
    assert!(pattern_matches("*", "anything"));
}

struct Recorder {
    spawned: RefCell<Vec<String>>,
    fail: bool,
}
impl Spawner for Recorder {
    fn spawn(&self, label: &str) -> Result<(), String> {
        if self.fail {
            return Err("창을 만들 수 없음".into());
        }
        self.spawned.borrow_mut().push(label.to_string());
        Ok(())
    }
}

#[test]
fn window_open_uses_a_free_label_and_reports_failures() {
    let r = Recorder {
        spawned: RefCell::new(vec![]),
        fail: false,
    };
    let mut existing = vec!["main".to_string()];
    for expect in ["win-2", "win-3", "win-4"] {
        let label = open_new_window(&r, &existing).unwrap();
        assert_eq!(label, expect);
        existing.push(label);
    }
    assert_eq!(*r.spawned.borrow(), ["win-2", "win-3", "win-4"]);

    let bad = Recorder {
        spawned: RefCell::new(vec![]),
        fail: true,
    };
    assert_eq!(
        open_new_window(&bad, &existing).unwrap_err(),
        "창을 만들 수 없음"
    );
    assert!(bad.spawned.borrow().is_empty());
}

#[test]
fn split_defaults_for_old_files_and_rejects_out_of_range() {
    let tmp = tempfile::tempdir().unwrap();
    // split이 없던 옛 파일은 반반(500)으로 읽는다
    let mut json: serde_json::Value = serde_json::to_value(sample()).unwrap();
    json.as_object_mut().unwrap().remove("split");
    fs::write(tmp.path().join("state.json"), json.to_string()).unwrap();
    assert_eq!(load(tmp.path(), "main").snapshot.unwrap().split, 500);

    // 범위를 벗어난 값은 무시하고 경고한다
    for bad in [0u32, 1000] {
        let mut s = sample();
        s.split = bad;
        save(tmp.path(), "main", &s).unwrap();
        let got = load(tmp.path(), "main");
        assert_eq!(got.snapshot, None, "split={bad}");
        assert!(got.warning.is_some());
    }
}
