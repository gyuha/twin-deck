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
    assert!(raw_nfd.as_str() < "나");
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

#[test]
fn sort_entries_matches_compare_names_semantics() {
    let (_t, root) = root();
    let fs = LocalFs;
    // 폴더 먼저, 대소문자 무시
    // 대소문자만 다른 이름은 만들지 않는다(APFS 기본 설정은 대소문자를 구분하지 않는다).
    for n in ["b.txt", "A.md", "zdir", "adir", "a.txt", "B.rs", "c"] {
        if n.ends_with("dir") {
            fs.mkdir(&root.join(n)).unwrap();
        } else {
            fs.create_file(&root.join(n)).unwrap();
        }
    }
    let mut list = fs.list(&root, &ListOptions::default()).unwrap();
    sort_entries(&mut list);
    let names: Vec<String> = list.iter().map(|e| e.name.to_lowercase()).collect();
    assert_eq!(
        names,
        ["adir", "zdir", "a.md", "a.txt", "b.rs", "b.txt", "c"]
    );
    // 같은 결과를 comparator 기반 정렬과도 대조한다
    let mut by_cmp = fs.list(&root, &ListOptions::default()).unwrap();
    by_cmp.sort_by(|a, b| {
        (b.kind == EntryKind::Dir)
            .cmp(&(a.kind == EntryKind::Dir))
            .then_with(|| compare_names(&a.name, &b.name))
    });
    let mut cached = fs.list(&root, &ListOptions::default()).unwrap();
    sort_entries(&mut cached);
    let a: Vec<String> = by_cmp.iter().map(|e| e.name.to_lowercase()).collect();
    let b: Vec<String> = cached.iter().map(|e| e.name.to_lowercase()).collect();
    assert_eq!(a, b);
}

#[test]
fn copy_file_not_found_names_the_missing_side() {
    let tmp = tempfile::tempdir().unwrap();
    let root = VfsPath::new(tmp.path());
    std::fs::write(tmp.path().join("src.txt"), "x").unwrap();
    // 원본은 있는데 대상 폴더가 없으면 대상 경로를 알려 준다(원본 경로를 탓하지 않는다).
    let missing_dest = root.join("nope/dst.txt");
    let err = LocalFs
        .copy_file(&root.join("src.txt"), &missing_dest)
        .unwrap_err();
    assert!(
        matches!(&err, VfsError::NotFound(p) if *p == missing_dest),
        "{err:?}"
    );
    // 원본이 없으면 원본 경로다.
    let gone = root.join("gone.txt");
    let err = LocalFs.copy_file(&gone, &root.join("dst.txt")).unwrap_err();
    assert!(
        matches!(&err, VfsError::NotFound(p) if *p == gone),
        "{err:?}"
    );
}

#[test]
fn preview_audio_files_carry_a_data_url_with_the_right_mime() {
    let (t, _root) = root();
    let cases = [
        ("a.mp3", "audio/mpeg"),
        ("b.WAV", "audio/wav"),
        ("c.ogg", "audio/ogg"),
        ("d.oga", "audio/ogg"),
        ("e.opus", "audio/ogg"),
        ("f.flac", "audio/flac"),
        ("g.m4a", "audio/mp4"),
        ("h.aac", "audio/aac"),
        ("i.weba", "audio/webm"),
    ];
    for (name, mime) in cases {
        let body = format!("RIFF-{name}").into_bytes();
        std::fs::write(t.path().join(name), &body).unwrap();
        let p = read_preview(&VfsPath::new(t.path().join(name)), PreviewLimits::default()).unwrap();
        assert_eq!(p.kind, PreviewKind::Audio, "{name}");
        assert!(!p.truncated);
        let url = p.data_url.unwrap();
        let b64 = url
            .strip_prefix(&format!("data:{mime};base64,"))
            .unwrap_or_else(|| panic!("{name}: {url}"));
        // 원본 바이트 그대로: 같은 바이트로 만든 data URL과 같다.
        assert_eq!(Some(url.clone()), td_vfs_audio_url(mime, &body), "{name}");
        assert!(!b64.is_empty());
    }
}

/// 테스트용: 기대하는 data URL을 표준 base64로 직접 만든다.
fn td_vfs_audio_url(mime: &str, bytes: &[u8]) -> Option<String> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for c in bytes.chunks(3) {
        let n = (u32::from(c[0]) << 16)
            | (u32::from(*c.get(1).unwrap_or(&0)) << 8)
            | u32::from(*c.get(2).unwrap_or(&0));
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 {
            T[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if c.len() > 2 {
            T[n as usize & 63] as char
        } else {
            '='
        });
    }
    Some(format!("data:{mime};base64,{out}"))
}

#[test]
fn preview_audio_over_the_limit_is_truncated_without_data() {
    let (t, _root) = root();
    std::fs::write(t.path().join("big.mp3"), vec![0u8; 2049]).unwrap();
    let limits = PreviewLimits {
        audio_bytes: 2048,
        ..PreviewLimits::default()
    };
    let p = read_preview(&VfsPath::new(t.path().join("big.mp3")), limits).unwrap();
    assert_eq!(p.kind, PreviewKind::Audio);
    assert!(p.truncated);
    assert_eq!(p.data_url, None);
    assert_eq!(p.size, 2049);
}

#[test]
fn preview_audio_extension_with_empty_content_does_not_fail() {
    let (t, _root) = root();
    std::fs::write(t.path().join("empty.wav"), b"").unwrap();
    let p = read_preview(
        &VfsPath::new(t.path().join("empty.wav")),
        PreviewLimits::default(),
    )
    .unwrap();
    assert_eq!(p.kind, PreviewKind::Audio);
    assert_eq!(p.data_url.as_deref(), Some("data:audio/wav;base64,"));
}

#[test]
fn audio_mime_is_none_for_non_audio() {
    assert_eq!(audio_mime("a.txt"), None);
    assert_eq!(audio_mime("noext"), None);
    assert_eq!(audio_mime("a.png"), None);
}

#[test]
fn preview_video_files_are_video_kind_without_data() {
    let (t, _root) = root();
    for name in [
        "a.mp4", "b.M4V", "c.mov", "d.webm", "e.ogv", "f.mkv", "g.avi",
    ] {
        std::fs::write(t.path().join(name), b"not-a-real-video").unwrap();
        let p = read_preview(&VfsPath::new(t.path().join(name)), PreviewLimits::default()).unwrap();
        assert_eq!(p.kind, PreviewKind::Video, "{name}");
        assert_eq!(p.data_url, None, "{name}: 비디오는 데이터를 싣지 않는다");
        assert!(!p.truncated);
        assert_eq!(p.size, 16);
    }
    assert!(!is_video("a.mp3") && !is_video("noext") && !is_video("a.txt"));
}
