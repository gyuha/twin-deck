use std::fs;
use std::path::Path;

use td_search::{CancelToken, FindSpec, Finder, SearchReport, TextSpec};
use td_vfs::{LocalFs, VfsPath};

/// tmp/
///   a.txt "hello world" · b.md "hello" · bin.dat "hello\0…" · empty.txt ""
///   sub/c.txt "goodbye" · sub/x.tmp "hello" · sub/deep/d.txt "hello deep"
///   node_modules/e.txt "hello"
fn tree() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let w = |rel: &str, body: &[u8]| {
        let p = tmp.path().join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, body).unwrap();
    };
    w("a.txt", b"hello world");
    w("b.md", b"hello");
    w("bin.dat", b"hello\0binary");
    w("empty.txt", b"");
    w("sub/c.txt", b"goodbye");
    w("sub/x.tmp", b"hello");
    w("sub/deep/d.txt", b"hello deep");
    w("node_modules/e.txt", b"hello");
    tmp
}

fn spec(root: &Path) -> FindSpec {
    FindSpec {
        roots: vec![VfsPath::new(root)],
        ..FindSpec::default()
    }
}

fn run(spec: FindSpec) -> (Vec<String>, SearchReport) {
    let finder = Finder::new(spec).unwrap();
    let mut names = Vec::new();
    let report = finder.run(&LocalFs, &CancelToken::new(), &mut |e| {
        names.push(e.name.clone())
    });
    names.sort();
    (names, report)
}

fn text(pattern: &str) -> Option<TextSpec> {
    Some(TextSpec {
        pattern: pattern.into(),
        case_sensitive: false,
        regex: false,
        invert: false,
    })
}

#[test]
fn find_matches_masks_recursively() {
    let tmp = tree();
    // ;로 나눈 여러 마스크가 하위 폴더까지 적용된다(와일드카드가 있어 부분 일치 옵션과 무관)
    let (names, report) = run(FindSpec {
        mask: "*.txt;*.md".into(),
        ..spec(tmp.path())
    });
    assert_eq!(
        names,
        ["a.txt", "b.md", "c.txt", "d.txt", "e.txt", "empty.txt"]
    );
    assert_eq!(report.matched, 6);
    assert!(!report.cancelled);
    // 마스크가 비면 파일과 폴더 모두 나온다
    let (all, _) = run(spec(tmp.path()));
    assert!(
        all.contains(&"sub".to_string())
            && all.contains(&"deep".to_string())
            && all.contains(&"d.txt".to_string())
    );
    assert_eq!(all.len(), 11, "파일 8개 + 폴더 3개: {all:?}");
}

#[test]
fn find_respects_max_depth() {
    let tmp = tree();
    let at = |depth: Option<u32>| {
        run(FindSpec {
            mask: "*.txt".into(),
            max_depth: depth,
            ..spec(tmp.path())
        })
        .0
    };
    assert_eq!(at(Some(0)), ["a.txt", "empty.txt"], "현재 디렉터리만");
    assert_eq!(
        at(Some(1)),
        ["a.txt", "c.txt", "e.txt", "empty.txt"],
        "1단계"
    );
    assert_eq!(
        at(Some(2)),
        ["a.txt", "c.txt", "d.txt", "e.txt", "empty.txt"],
        "2단계"
    );
    assert_eq!(at(None), at(Some(2)), "무제한");
}

#[test]
fn find_excludes_dirs_and_files() {
    let tmp = tree();
    let (names, _) = run(FindSpec {
        exclude_dirs: "node_modules".into(),
        exclude_files: "*.tmp;empty.txt".into(),
        ..spec(tmp.path())
    });
    assert!(
        !names.contains(&"node_modules".into()),
        "제외 폴더는 결과에도 없다"
    );
    assert!(
        !names.contains(&"e.txt".into()),
        "제외 폴더 안으로 들어가지 않는다"
    );
    assert!(!names.contains(&"x.tmp".into()) && !names.contains(&"empty.txt".into()));
    assert!(names.contains(&"c.txt".into()) && names.contains(&"sub".into()));
    // 와일드카드 없는 제외 토큰은 이름이 정확히 같아야 한다
    let (names, _) = run(FindSpec {
        exclude_dirs: "node".into(),
        ..spec(tmp.path())
    });
    assert!(
        names.contains(&"e.txt".into()),
        "`node`는 `node_modules`를 제외하지 않는다"
    );
}

#[test]
fn find_substring_vs_exact_name() {
    let tmp = tempfile::tempdir().unwrap();
    for n in ["report.txt", "my-Report-2.txt", "other.txt"] {
        fs::write(tmp.path().join(n), "x").unwrap();
    }
    let find = |mask: &str, substring: bool| {
        run(FindSpec {
            mask: mask.into(),
            substring,
            ..spec(tmp.path())
        })
        .0
    };
    assert_eq!(
        find("report", true),
        ["my-Report-2.txt", "report.txt"],
        "부분 일치(대소문자 무시)"
    );
    assert!(
        find("report", false).is_empty(),
        "정확히 같아야 하므로 확장자까지 쓰지 않으면 없다"
    );
    assert_eq!(find("REPORT.TXT", false), ["report.txt"]);
    assert_eq!(
        find("*port*", false),
        ["my-Report-2.txt", "report.txt"],
        "와일드카드는 옵션과 무관"
    );
}

#[test]
fn find_regex_name() {
    let tmp = tree();
    let (names, _) = run(FindSpec {
        mask: r"^[ab]\.(txt|md)$".into(),
        regex: true,
        ..spec(tmp.path())
    });
    assert_eq!(names, ["a.txt", "b.md"]);
    let (names, _) = run(FindSpec {
        mask: r"^D\.TXT$".into(),
        regex: true,
        ..spec(tmp.path())
    });
    assert_eq!(names, ["d.txt"], "대소문자 무시");
    // 잘못된 정규식은 시작 전에 거부된다
    let err = Finder::new(FindSpec {
        mask: "(".into(),
        regex: true,
        ..spec(tmp.path())
    })
    .err()
    .unwrap();
    assert!(err.contains("정규식"), "{err}");
    assert!(
        Finder::new(FindSpec {
            text: text("("),
            ..spec(tmp.path())
        })
        .is_ok(),
        "일반 텍스트의 `(`는 정규식이 아니므로 오류가 아니다"
    );
    let bad = TextSpec {
        pattern: "(".into(),
        case_sensitive: false,
        regex: true,
        invert: false,
    };
    assert!(Finder::new(FindSpec {
        text: Some(bad),
        ..spec(tmp.path())
    })
    .is_err());
}

#[test]
fn find_text_in_files() {
    let tmp = tree();
    // 대소문자 무시: 바이너리(bin.dat)와 내용이 다른 c.txt, 빈 파일은 빠진다
    let (names, report) = run(FindSpec {
        text: text("HELLO"),
        ..spec(tmp.path())
    });
    assert_eq!(names, ["a.txt", "b.md", "d.txt", "e.txt", "x.tmp"]);
    assert_eq!(
        report.warnings.len(),
        1,
        "바이너리를 건너뛰었다는 경고: {:?}",
        report.warnings
    );
    assert!(report.warnings[0].contains('1'));
    // 대소문자 구분
    let cs = TextSpec {
        pattern: "HELLO".into(),
        case_sensitive: true,
        regex: false,
        invert: false,
    };
    assert!(run(FindSpec {
        text: Some(cs),
        ..spec(tmp.path())
    })
    .0
    .is_empty());
    // 정규식 + 마스크를 함께: *.txt 중 "hello deep"
    let re = TextSpec {
        pattern: r"hel+o\s+deep".into(),
        case_sensitive: false,
        regex: true,
        invert: false,
    };
    let (names, _) = run(FindSpec {
        mask: "*.txt".into(),
        text: Some(re),
        ..spec(tmp.path())
    });
    assert_eq!(names, ["d.txt"]);
    // 폴더는 텍스트 검색의 결과가 아니다
    assert!(!run(FindSpec {
        text: text("sub"),
        ..spec(tmp.path())
    })
    .0
    .contains(&"sub".into()));
}

#[test]
fn find_text_inverted() {
    let tmp = tree();
    let inv = TextSpec {
        pattern: "hello".into(),
        case_sensitive: false,
        regex: false,
        invert: true,
    };
    let (names, _) = run(FindSpec {
        text: Some(inv),
        ..spec(tmp.path())
    });
    assert_eq!(
        names,
        ["c.txt", "empty.txt"],
        "텍스트가 없는 텍스트 파일만(바이너리는 제외)"
    );
}

#[cfg(unix)]
#[test]
fn find_follow_symlinks_without_looping() {
    use std::os::unix::fs::symlink;

    let tmp = tree();
    let other = tempfile::tempdir().unwrap();
    fs::write(other.path().join("far.txt"), "far").unwrap();
    symlink(tmp.path(), tmp.path().join("loop")).unwrap(); // 자기 부모를 가리킨다
    symlink(other.path(), tmp.path().join("ext")).unwrap(); // 다른 폴더
    let count = |names: &[String], n: &str| names.iter().filter(|x| x.as_str() == n).count();

    // 따라가지 않으면 링크는 한 항목일 뿐이고 그 안으로 들어가지 않는다
    let (names, _) = run(spec(tmp.path()));
    assert_eq!(count(&names, "loop"), 1);
    assert_eq!(count(&names, "far.txt"), 0);
    assert_eq!(count(&names, "c.txt"), 1);

    // 따라가면 다른 폴더 안까지 찾되, 순환(loop)에 빠지지 않고 같은 폴더를 두 번 훑지 않는다
    let (names, report) = run(FindSpec {
        follow_symlinks: true,
        ..spec(tmp.path())
    });
    assert_eq!(count(&names, "far.txt"), 1);
    assert_eq!(
        count(&names, "c.txt"),
        1,
        "순환 링크로 같은 파일이 다시 나오지 않는다"
    );
    assert_eq!(count(&names, "loop"), 1);
    assert!(
        report.visited < 100,
        "무한 순회가 아니다: {}",
        report.visited
    );
}

#[test]
fn find_only_items_cancel_and_roots() {
    let tmp = tree();
    // 선택 항목: 폴더는 재귀, 파일은 그 자체. roots는 무시된다.
    let only = vec![
        VfsPath::new(tmp.path().join("sub")),
        VfsPath::new(tmp.path().join("a.txt")),
    ];
    let (names, _) = run(FindSpec {
        only_items: Some(only),
        mask: "*.txt".into(),
        ..spec(tmp.path())
    });
    assert_eq!(names, ["a.txt", "c.txt", "d.txt"]);
    // 여러 시작 디렉터리
    let roots = vec![
        VfsPath::new(tmp.path().join("sub")),
        VfsPath::new(tmp.path().join("node_modules")),
    ];
    let (names, _) = run(FindSpec {
        roots,
        mask: "*.txt".into(),
        ..FindSpec::default()
    });
    assert_eq!(names, ["c.txt", "d.txt", "e.txt"]);
    // 취소되면 즉시 멈춘다
    let cancel = CancelToken::new();
    cancel.cancel();
    let report = Finder::new(spec(tmp.path()))
        .unwrap()
        .run(&LocalFs, &cancel, &mut |_| panic!("취소 후 결과가 나왔다"));
    assert!(report.cancelled);
}
