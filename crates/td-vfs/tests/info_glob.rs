use td_vfs::{glob_match, EntryKind, LocalFs, Vfs, VfsPath};
use unicode_normalization::UnicodeNormalization;

/// 케이스는 apps/desktop의 TS 매처(`globMatch`) 테스트와 같은 표를 쓴다. 한쪽을 고치면 다른 쪽도 고친다.
const CASES: &[(&str, &str, bool)] = &[
    ("*", "anything", true),
    ("*", "", true),
    ("*.txt", "a.txt", true),
    ("*.txt", "A.TXT", true),
    ("*.txt", "a.txt.bak", false),
    ("a?c", "abc", true),
    ("a?c", "ac", false),
    ("a?c", "abbc", false),
    ("[abc].md", "b.md", true),
    ("[abc].md", "d.md", false),
    ("[a-c]*", "beta", true),
    ("[a-c]*", "delta", false),
    ("[!a-c]*", "delta", true),
    ("[^a-c]*", "beta", false),
    ("file[0-9][0-9]", "file07", true),
    ("file[0-9][0-9]", "file7", false),
    ("*a*b*", "xxaxxbxx", true),
    ("*a*b*", "xxbxxaxx", false),
    ("**", "x", true),
    ("a*", "a", true),
    ("[abc", "[abc", true),
    ("[]a]x", "]x", true),
    ("", "", true),
    ("", "a", false),
    ("*.tar.gz", "backup.tar.gz", true),
    ("한*", "한글.txt", true),
];

#[test]
fn glob_group_match() {
    for (pattern, name, want) in CASES {
        assert_eq!(
            glob_match(pattern, name),
            *want,
            "glob_match({pattern:?}, {name:?})"
        );
    }
    // NFD로 저장된 한글 이름과 NFC 패턴
    let nfd: String = "한글.txt".nfd().collect();
    assert!(glob_match("한*", &nfd));
    assert!(glob_match(&"한글".nfd().collect::<String>(), "한글"));
    // 병적인 패턴도 빨리 끝난다
    let long = "a".repeat(5000);
    assert!(!glob_match(
        &"a*".repeat(200).replace("a*a*", "a*a*b"),
        &long
    ));
}

#[test]
fn file_info_fields() {
    let tmp = tempfile::tempdir().unwrap();
    let root = VfsPath::new(tmp.path());
    let fs = LocalFs;

    let file = root.join("f.txt");
    std::fs::write(file.as_path(), "hello").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(file.as_path(), std::fs::Permissions::from_mode(0o640)).unwrap();
    }
    let info = fs.info(&file).unwrap();
    assert_eq!(info.entry.name, "f.txt");
    assert_eq!(info.entry.kind, EntryKind::File);
    assert_eq!(info.entry.size, 5);
    assert!(info.entry.modified.is_some());
    assert!(info.accessed.is_some());
    assert!(info.link_target.is_none());
    assert!(info.child_count.is_none());
    #[cfg(unix)]
    assert_eq!(info.entry.mode, Some(0o640));

    let dir = root.join("d");
    fs.mkdir(&dir).unwrap();
    fs.create_file(&dir.join("a")).unwrap();
    fs.create_file(&dir.join("b")).unwrap();
    let info = fs.info(&dir).unwrap();
    assert_eq!(info.entry.kind, EntryKind::Dir);
    assert_eq!(info.child_count, Some(2));

    #[cfg(unix)]
    {
        let link = root.join("ln");
        fs.symlink(&VfsPath::new("f.txt"), &link, false).unwrap();
        let info = fs.info(&link).unwrap();
        assert_eq!(info.entry.kind, EntryKind::Symlink);
        assert_eq!(info.link_target, Some(VfsPath::new("f.txt")));
    }

    assert!(matches!(
        fs.info(&root.join("nope")),
        Err(td_vfs::VfsError::NotFound(_))
    ));
}
