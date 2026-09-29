use td_vfs::*;
use unicode_normalization::UnicodeNormalization;

fn root() -> (tempfile::TempDir, VfsPath) {
    let t = tempfile::tempdir().unwrap();
    let p = VfsPath::new(t.path());
    (t, p)
}

#[test]
fn list_stat_and_basic_ops() {
    let (_t, root) = root();
    let fs = LocalFs;
    fs.mkdir(&root.join("a/b/c")).unwrap();
    fs.create_file(&root.join("f.txt")).unwrap();
    assert!(matches!(
        fs.create_file(&root.join("f.txt")),
        Err(VfsError::AlreadyExists(_))
    ));
    assert!(matches!(
        fs.mkdir(&root.join("a")),
        Err(VfsError::AlreadyExists(_))
    ));
    let mut list = fs.list(&root, &ListOptions::default()).unwrap();
    sort_entries(&mut list);
    assert_eq!(list[0].name, "a");
    assert_eq!(list[0].kind, EntryKind::Dir);
    assert_eq!(list[1].name, "f.txt");
    assert_eq!(list[1].size, 0);
    assert!(list[1].modified.is_some());
    fs.rename(&root.join("f.txt"), &root.join("g.txt")).unwrap();
    assert!(matches!(
        fs.stat(&root.join("f.txt")),
        Err(VfsError::NotFound(_))
    ));
    assert_eq!(
        fs.copy_file(&root.join("g.txt"), &root.join("h.txt"))
            .unwrap(),
        0
    );
    fs.remove_file(&root.join("g.txt")).unwrap();
    fs.remove_dir_all(&root.join("a")).unwrap();
    assert_eq!(fs.list(&root, &ListOptions::default()).unwrap().len(), 1);
}

#[test]
fn hidden_files_filtered_and_optional() {
    let (_t, root) = root();
    let fs = LocalFs;
    fs.create_file(&root.join(".secret")).unwrap();
    fs.create_file(&root.join("open")).unwrap();
    let hidden = fs.list(&root, &ListOptions::default()).unwrap();
    assert_eq!(hidden.len(), 1);
    let all = fs.list(&root, &ListOptions { show_hidden: true }).unwrap();
    assert_eq!(all.len(), 2);
    assert!(all.iter().any(|e| e.name == ".secret" && e.hidden));
}

#[test]
fn nfd_korean_sort() {
    let (_t, root) = root();
    let fs = LocalFs;
    // 다(NFD), 나(NFC), 가(NFD) 순서로 만들어도 가나다 순이어야 한다.
    for n in [
        "다".nfd().collect::<String>(),
        "나".nfc().collect::<String>(),
        "가".nfd().collect::<String>(),
    ] {
        fs.create_file(&root.join(&n)).unwrap();
    }
    let mut list = fs.list(&root, &ListOptions::default()).unwrap();
    sort_entries(&mut list);
    let names: Vec<String> = list.iter().map(|e| normalize_name(&e.name)).collect();
    assert_eq!(names, ["가", "나", "다"]);
    // 정규화 없는 비교는 NFD 자모가 완성형보다 앞서 순서가 깨진다.
    let raw_nfd = "다".nfd().collect::<String>();
    assert!(raw_nfd < "나".to_string());
    assert_eq!(compare_names(&raw_nfd, "나"), std::cmp::Ordering::Greater);
}

#[test]
fn nfd_korean_quick_select() {
    let (_t, root) = root();
    let fs = LocalFs;
    let stored = "한글파일.txt".nfd().collect::<String>();
    fs.create_file(&root.join(&stored)).unwrap();
    let list = fs.list(&root, &ListOptions::default()).unwrap();
    let typed = "한글".nfc().collect::<String>();
    assert!(list.iter().any(|e| matches_prefix(&e.name, &typed)));
    assert!(!list.iter().any(|e| matches_prefix(&e.name, "영어")));
    assert!(matches_prefix("README.md", "read"));
}
