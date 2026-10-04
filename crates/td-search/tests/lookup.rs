use std::fs::{self, File};
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use td_search::{
    parse, search, spawn, walk, CancelToken, Cond, Field, Op, ParseError, SearchEvent,
    SearchOptions, SimpleKind, TextOp,
};
use td_vfs::{LocalFs, VfsPath};
use unicode_normalization::UnicodeNormalization;

/// 2026-09-30 12:00:00 UTC
const NOW: u64 = 1_790_769_600;

fn now() -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(NOW)
}

fn q(input: &str) -> Vec<Cond> {
    parse(input, now())
        .unwrap_or_else(|e| panic!("{input:?}: {e}"))
        .conds
}

fn err(input: &str) -> ParseError {
    parse(input, now()).expect_err(input)
}

fn name_test(c: &Cond) -> (TextOp, &str) {
    match c {
        Cond::Name(t) => (t.op, t.arg.as_str()),
        other => panic!("Name 조건이 아님: {other:?}"),
    }
}

#[test]
fn lookup_query_parse() {
    // 이름만 입력 → 이름 부분 일치 (공백 포함 여러 단어도 통째로)
    assert_eq!(name_test(&q("report")[0]), (TextOp::Contains, "report"));
    assert_eq!(
        name_test(&q("  my report  ")[0]),
        (TextOp::Contains, "my report")
    );
    assert_eq!(
        name_test(&q("\"a and b\"")[0]),
        (TextOp::Contains, "a and b")
    );
    // 변수 이름처럼 보여도 연산자가 없으면 이름
    assert_eq!(name_test(&q("Name")[0]), (TextOp::Contains, "Name"));
    assert_eq!(
        name_test(&q("size matters")[0]),
        (TextOp::Contains, "size matters")
    );
    // 종류만 쓴 간단 조건 (대소문자와 공백 무시)
    for (text, kind) in [
        ("Folder", SimpleKind::Folder),
        ("file", SimpleKind::File),
        ("ARCHIVE", SimpleKind::Archive),
        ("Disk Image", SimpleKind::DiskImage),
        ("Text", SimpleKind::Text),
        ("RTF", SimpleKind::Rtf),
        ("HTML", SimpleKind::Html),
        ("XML", SimpleKind::Xml),
        ("Source Code", SimpleKind::SourceCode),
        ("Image", SimpleKind::Image),
        ("Video", SimpleKind::Video),
        ("Audio", SimpleKind::Audio),
        ("Executable", SimpleKind::Executable),
        ("ZIP", SimpleKind::Zip),
    ] {
        assert_eq!(
            q(text),
            [Cond::Kind {
                kind,
                negate: false
            }],
            "{text}"
        );
    }
    // 복합 조건: 공백 없는 기호 연산자, 따옴표 인수, 여러 단어 인수
    assert_eq!(
        name_test(&q("Name contains \"my report\"")[0]),
        (TextOp::Contains, "my report")
    );
    assert_eq!(
        name_test(&q("Name=report.txt")[0]),
        (TextOp::Is, "report.txt")
    );
    assert_eq!(
        name_test(&q("name startsWith 'a b'")[0]),
        (TextOp::StartsWith, "a b")
    );
    assert_eq!(
        name_test(&q("Name endsWith .rs")[0]),
        (TextOp::EndsWith, ".rs")
    );
    assert_eq!(
        name_test(&q("Name contains hello world")[0]),
        (TextOp::Contains, "hello world")
    );
    assert_eq!(
        name_test(&q("이름 has 보고서")[0]),
        (TextOp::Contains, "보고서")
    );
    // 따옴표 안의 이스케이프
    assert_eq!(
        name_test(&q(r#"Name is "say \"hi\"""#)[0]),
        (TextOp::Is, "say \"hi\"")
    );
    // 크기: 단위, 소수, 1024 배수
    assert_eq!(
        q("Size > 10KB"),
        [Cond::Size {
            op: Op::Gt,
            bytes: 10 * 1024
        }]
    );
    assert_eq!(
        q("size<=1.5mb"),
        [Cond::Size {
            op: Op::Le,
            bytes: 1_572_864
        }]
    );
    assert_eq!(
        q("Size = 500"),
        [Cond::Size {
            op: Op::Is,
            bytes: 500
        }]
    );
    // 날짜: 하루 / 정확한 시각 / today / 상대
    let day = |secs: u64| {
        (
            UNIX_EPOCH + Duration::from_secs(secs),
            UNIX_EPOCH + Duration::from_secs(secs + 86_400),
        )
    };
    let (lo, hi) = day(1_788_220_800); // 2026-09-01
    assert_eq!(
        q("Modified = 2026-09-01"),
        [Cond::Time {
            field: Field::Modified,
            op: Op::Is,
            lo,
            hi
        }]
    );
    let lo = UNIX_EPOCH + Duration::from_secs(1_790_591_400); // 2026-09-28 10:30
    assert_eq!(
        q("Created >= \"2026-09-28 10:30\""),
        [Cond::Time {
            field: Field::Created,
            op: Op::Ge,
            lo,
            hi: lo + Duration::from_secs(1)
        }]
    );
    let (lo, hi) = day(NOW / 86_400 * 86_400);
    assert_eq!(
        q("Modified is today"),
        [Cond::Time {
            field: Field::Modified,
            op: Op::Is,
            lo,
            hi
        }]
    );
    let lo = UNIX_EPOCH + Duration::from_secs(NOW - 7 * 86_400);
    assert_eq!(
        q("Modified > 7d"),
        [Cond::Time {
            field: Field::Modified,
            op: Op::Gt,
            lo,
            hi: lo + Duration::from_secs(1)
        }]
    );
    // Kind 변수
    assert_eq!(
        q("Kind is Image"),
        [Cond::Kind {
            kind: SimpleKind::Image,
            negate: false
        }]
    );
    assert_eq!(
        q("Kind != \"Source Code\""),
        [Cond::Kind {
            kind: SimpleKind::SourceCode,
            negate: true
        }]
    );
    // 결합(AND): and / AND / &&, 따옴표 안의 and는 결합이 아니다
    let c = q("Image and Size > 1MB AND Name contains cat && Modified > 7d");
    assert_eq!(c.len(), 4);
    assert!(matches!(
        c[0],
        Cond::Kind {
            kind: SimpleKind::Image,
            ..
        }
    ));
    assert!(matches!(c[3], Cond::Time { .. }));
    assert_eq!(q("Name is \"rock and roll\"").len(), 1);
    // 지원하지 않는 변수/종류는 오류가 아니라 Unsupported
    assert_eq!(
        q("UTI is public.image"),
        [Cond::Unsupported { what: "UTI".into() }]
    );
    assert_eq!(
        q("Application"),
        [Cond::Unsupported {
            what: "Application".into()
        }]
    );
    assert_eq!(
        q("Kind is Bundle"),
        [Cond::Unsupported {
            what: "Bundle".into()
        }]
    );

    // 오류와 위치(바이트 오프셋)
    assert_eq!(err("").pos, 0);
    assert_eq!(err("Name is \"open").pos, 8); // 닫히지 않은 따옴표의 시작
    assert_eq!(err("Name contains").pos, 13); // 인수 없음: 연산자 뒤
    assert_eq!(err("Image and").pos, 9); // AND 뒤가 비었다
    assert_eq!(err("and Image").pos, 0); // AND 앞이 비었다: AND 토큰을 가리킨다
    assert_eq!(err("Size > big").pos, 7);
    assert_eq!(err("Size contains 5").pos, 14);
    assert_eq!(err("Modified = 2026-13-40").pos, 11);
    assert_eq!(err("Kind is Nonsense").pos, 8);
    assert_eq!(err("Name > 5").pos, 7);
    assert!(err("Size > big").message.contains("크기"));
}

#[test]
fn lookup_operator_aliases() {
    use Op::*;
    let cases: &[(&[&str], Op)] = &[
        (&["=", "==", "is", "IS", "equals", "Equals"], Is),
        (&["!=", "isNot", "isnot", "ISNOT"], IsNot),
        (&["contains", "has", "Has"], Contains),
        (&["like", "~=", "LIKE"], Like),
        (&["startsWith", "startswith"], StartsWith),
        (&["endsWith", "ENDSWITH"], EndsWith),
    ];
    for (aliases, canonical) in cases {
        for alias in *aliases {
            let text_op = match canonical {
                Is => TextOp::Is,
                IsNot => TextOp::IsNot,
                Contains => TextOp::Contains,
                Like => TextOp::Like,
                StartsWith => TextOp::StartsWith,
                EndsWith => TextOp::EndsWith,
                _ => unreachable!(),
            };
            for input in [format!("Name {alias} abc"), format!("Content {alias} abc")] {
                let conds = q(&input);
                let got = match &conds[0] {
                    Cond::Name(t) | Cond::Content(t) => t.op,
                    other => panic!("{input}: {other:?}"),
                };
                assert_eq!(got, text_op, "{input}");
            }
        }
    }
    // 크기/날짜 비교 연산자는 그대로
    for (sym, op) in [
        ("<", Lt),
        ("<=", Le),
        (">", Gt),
        (">=", Ge),
        ("=", Is),
        ("==", Is),
        ("equals", Is),
        ("!=", IsNot),
        ("isNot", IsNot),
    ] {
        assert_eq!(
            q(&format!("Size {sym} 1")),
            [Cond::Size { op, bytes: 1 }],
            "{sym}"
        );
    }
    // 숫자 변수에 문자열 연산자는 오류
    for bad in ["contains", "has", "like", "~=", "startsWith", "endsWith"] {
        assert!(parse(&format!("Size {bad} 1"), now()).is_err(), "{bad}");
    }
}

/// tempdir 트리:
///   a.txt(hello world, 11B)   notes.md(Hello!, 6B)   big.log(2 MiB 'x')   pic.PNG(바이트)   bin.dat(NUL 포함)
///   .hidden.txt(secret)       run.sh(755)            pack.zip
///   docs/readme.md            docs/deep/한글보고서.txt(비밀 내용)      empty/
fn build_tree(root: &Path) {
    fs::create_dir_all(root.join("docs/deep")).unwrap();
    fs::create_dir(root.join("empty")).unwrap();
    fs::write(root.join("a.txt"), "hello world").unwrap();
    fs::write(root.join("notes.md"), "Hello!").unwrap();
    fs::write(root.join("big.log"), vec![b'x'; 2 * 1024 * 1024]).unwrap();
    fs::write(root.join("pic.PNG"), [0x89, b'P', b'N', b'G']).unwrap();
    fs::write(root.join("bin.dat"), b"secret\0binary").unwrap();
    fs::write(root.join(".hidden.txt"), "secret").unwrap();
    fs::write(root.join("run.sh"), "#!/bin/sh\n").unwrap();
    fs::write(root.join("pack.zip"), "PK").unwrap();
    fs::write(root.join("docs/readme.md"), "read me").unwrap();
    fs::write(root.join("docs/deep/한글보고서.txt"), "비밀 내용").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root.join("run.sh"), fs::Permissions::from_mode(0o755)).unwrap();
    }
    let set_mtime = |name: &str, secs: u64| {
        File::options()
            .write(true)
            .open(root.join(name))
            .unwrap()
            .set_modified(UNIX_EPOCH + Duration::from_secs(secs))
            .unwrap();
    };
    set_mtime("a.txt", 1_788_220_800 + 3600); // 2026-09-01 01:00
    set_mtime("notes.md", NOW - 2 * 86_400); // 이틀 전
    set_mtime("docs/readme.md", 1_600_000_000); // 2020-09
}

fn run(root: &Path, query: &str) -> (Vec<String>, td_search::SearchReport) {
    let query = parse(query, now()).unwrap();
    let mut found = Vec::new();
    let report = search(
        &LocalFs,
        &VfsPath::new(root),
        &query,
        &SearchOptions::default(),
        &CancelToken::new(),
        &mut |e| {
            found.push(
                e.path
                    .as_path()
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/"),
            )
        },
    );
    found.sort();
    (found, report)
}

fn names(root: &Path, query: &str) -> Vec<String> {
    run(root, query).0
}

#[test]
fn lookup_live_search() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    build_tree(root);

    // 이름: 부분 일치는 대소문자와 NFC/NFD를 가리지 않고, 숨김 파일과 하위 폴더까지 본다
    assert_eq!(names(root, "hello"), Vec::<String>::new()); // 내용이 아니라 이름만 본다
    assert_eq!(names(root, "readme"), ["docs/readme.md"]);
    assert_eq!(names(root, "PNG"), ["pic.PNG"]);
    assert_eq!(names(root, "hidden"), [".hidden.txt"]);
    assert_eq!(names(root, "한글"), ["docs/deep/한글보고서.txt"]);
    let nfd: String = "한글".nfd().collect();
    assert_eq!(names(root, &nfd), ["docs/deep/한글보고서.txt"]);
    assert_eq!(names(root, "Name is a.txt"), ["a.txt"]);
    assert_eq!(
        names(root, "Name != a.txt and Name endsWith .txt"),
        [".hidden.txt", "docs/deep/한글보고서.txt"]
    );
    assert_eq!(
        names(root, "Name like *.MD"),
        ["docs/readme.md", "notes.md"]
    ); // like = glob
    assert_eq!(names(root, "Name ~= r?n.*"), ["run.sh"]);
    assert_eq!(names(root, "Name startsWith re"), ["docs/readme.md"]);

    // 종류
    assert_eq!(names(root, "Folder"), ["docs", "docs/deep", "empty"]);
    assert_eq!(names(root, "Image"), ["pic.PNG"]);
    assert_eq!(names(root, "Archive"), ["pack.zip"]);
    assert_eq!(names(root, "ZIP"), ["pack.zip"]);
    assert_eq!(
        names(root, "Text"),
        [
            ".hidden.txt",
            "a.txt",
            "big.log",
            "docs/deep/한글보고서.txt",
            "docs/readme.md",
            "notes.md"
        ]
    );
    assert_eq!(names(root, "Source Code"), ["run.sh"]);
    #[cfg(unix)]
    assert_eq!(names(root, "Executable"), ["run.sh"]);
    assert_eq!(
        names(root, "Kind != Folder and Kind is File and Name contains d"),
        [".hidden.txt", "bin.dat", "docs/readme.md", "notes.md"]
    );
    let files = names(root, "File");
    assert!(files.contains(&"a.txt".to_string()) && !files.contains(&"docs".to_string()));

    // 크기
    assert_eq!(names(root, "Size > 1MB"), ["big.log"]);
    assert_eq!(names(root, "Size = 11"), ["a.txt"]);
    assert_eq!(
        names(root, "Size < 7 and File and Name endsWith md"),
        ["notes.md"]
    );

    // 날짜
    assert_eq!(names(root, "Modified = 2026-09-01"), ["a.txt"]);
    assert_eq!(names(root, "Modified < 2021-01-01"), ["docs/readme.md"]);
    assert_eq!(
        names(
            root,
            "Modified >= 2026-09-01 01:00 and Modified <= 2026-09-01 01:00"
        ),
        ["a.txt"]
    );
    assert_eq!(
        names(root, "Modified > 3d and Name endsWith md"),
        ["notes.md"]
    ); // 3일 이내에 바뀐 .md
    assert_eq!(names(root, "Created > 2100-01-01"), Vec::<String>::new());
    assert!(names(root, "Created < 2100-01-01").contains(&"a.txt".to_string()));

    // 본문: 텍스트 파일만, 대소문자 무시, 크기 상한(1 MiB) 초과와 이진 파일(NUL)은 제외
    assert_eq!(names(root, "Content contains hello"), ["a.txt", "notes.md"]);
    assert_eq!(names(root, "Content has \"hello world\""), ["a.txt"]);
    assert_eq!(
        names(root, "Content startsWith hello and Size < 100"),
        ["a.txt", "notes.md"]
    );
    assert_eq!(names(root, "Content contains secret"), [".hidden.txt"]); // bin.dat은 이진
    assert_eq!(names(root, "Content contains xxxx"), Vec::<String>::new()); // big.log은 상한 초과
    assert_eq!(
        names(root, "Content contains 비밀"),
        ["docs/deep/한글보고서.txt"]
    );
    assert_eq!(names(root, "Content like hello*"), ["a.txt", "notes.md"]);
    // 종류와 본문 결합
    assert_eq!(
        names(root, "Text and Content contains hello"),
        ["a.txt", "notes.md"]
    );

    // 보고서: 방문 수와 완료
    let (found, report) = run(root, "Name contains md");
    assert_eq!(found, ["docs/readme.md", "notes.md"]);
    assert_eq!(
        (report.matched, report.cancelled, report.unreadable),
        (2, false, 0)
    );
    assert_eq!(report.visited, 13); // 파일 10 + 폴더 3
    assert!(report.warnings.is_empty());

    // 스트리밍: 스레드 검색은 결과를 하나씩 채널로 보내고 마지막에 Done을 보낸다
    let handle = spawn(
        LocalFs,
        VfsPath::new(root),
        parse("Name endsWith .txt", now()).unwrap(),
        SearchOptions::default(),
    );
    let mut streamed = Vec::new();
    let done = loop {
        match handle.events.recv_timeout(Duration::from_secs(10)).unwrap() {
            SearchEvent::Match(e) => streamed.push(e.name),
            SearchEvent::Done(r) => break r,
        }
    };
    streamed.sort();
    assert_eq!(streamed, [".hidden.txt", "a.txt", "한글보고서.txt"]);
    assert_eq!(done.matched, 3);
    assert!(
        handle.events.try_recv().is_err(),
        "Done 뒤에는 아무것도 오지 않는다"
    );
}

#[test]
fn lookup_cancel() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    const DIRS: usize = 40;
    const FILES: usize = 50;
    for d in 0..DIRS {
        let dir = root.join(format!("d{d:02}"));
        fs::create_dir(&dir).unwrap();
        for f in 0..FILES {
            fs::write(dir.join(format!("file{f:02}.txt")), "x").unwrap();
        }
    }
    let total = (DIRS + DIRS * FILES) as u64;
    let query = parse("Name contains file", now()).unwrap();

    // 전체 순회 기준선
    let full = search(
        &LocalFs,
        &VfsPath::new(root),
        &query,
        &SearchOptions::default(),
        &CancelToken::new(),
        &mut |_| {},
    );
    assert_eq!(
        (full.visited, full.matched, full.cancelled),
        (total, (DIRS * FILES) as u64, false)
    );

    // 첫 결과에서 취소하면 그 폴더만 훑고 멈추며, 취소 뒤에는 콜백이 오지 않는다
    let cancel = CancelToken::new();
    let mut after_cancel = 0;
    let mut got = 0;
    let report = search(
        &LocalFs,
        &VfsPath::new(root),
        &query,
        &SearchOptions::default(),
        &cancel,
        &mut |_| {
            if cancel.is_cancelled() {
                after_cancel += 1;
            }
            got += 1;
            if got == 1 {
                cancel.cancel();
            }
        },
    );
    assert!(report.cancelled);
    assert_eq!((got, after_cancel), (1, 0));
    assert!(
        report.visited < total / 2,
        "취소 뒤에도 계속 훑었다: {} / {total}",
        report.visited
    );

    // 시작 전에 이미 취소돼 있으면 아무것도 훑지 않는다
    let cancelled = CancelToken::new();
    cancelled.cancel();
    let none = search(
        &LocalFs,
        &VfsPath::new(root),
        &query,
        &SearchOptions::default(),
        &cancelled,
        &mut |_| panic!("취소됨"),
    );
    assert_eq!((none.visited, none.matched, none.cancelled), (0, 0, true));

    // walk도 같은 취소 규칙을 따른다
    let cancel = CancelToken::new();
    let mut seen = 0;
    let w = walk(&LocalFs, &VfsPath::new(root), &cancel, &mut |_| {
        seen += 1;
        if seen == 5 {
            cancel.cancel();
        }
    });
    assert_eq!((seen, w.visited, w.cancelled), (5, 5, true));

    // 스레드 검색: 핸들을 버리면 취소하고 스레드가 끝나기를 기다린다
    let handle = spawn(LocalFs, VfsPath::new(root), query, SearchOptions::default());
    let first = handle.events.recv_timeout(Duration::from_secs(10)).unwrap();
    assert!(matches!(first, SearchEvent::Match(_)));
    handle.cancel();
    let mut later_matches = 0;
    let mut done = None;
    while let Ok(ev) = handle.events.recv_timeout(Duration::from_secs(10)) {
        match ev {
            SearchEvent::Match(_) => later_matches += 1,
            SearchEvent::Done(r) => {
                done = Some(r);
                break;
            }
        }
    }
    let done = done.expect("Done 이벤트");
    assert!(done.cancelled);
    assert!(
        later_matches < DIRS * FILES - 1,
        "취소 뒤에도 전부 전달됐다"
    );
    drop(handle);
}

#[test]
fn lookup_unsupported_variable_warns() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    build_tree(root);

    for (query, what) in [
        ("UTI is public.image", "UTI"),
        ("Author contains kim", "Author"),
        ("Title = Report", "Title"),
        ("Album has Abbey", "Album"),
        ("Genre is Jazz", "Genre"),
        ("Application", "Application"),
        ("Kind is Bundle", "Bundle"),
        ("Name contains a and Author = kim", "Author"),
    ] {
        let (found, report) = run(root, query);
        assert!(
            found.is_empty(),
            "{query}: 결과가 있으면 안 된다: {found:?}"
        );
        assert_eq!(report.visited, 0, "{query}: 미지원 질의는 순회하지 않는다");
        assert!(!report.cancelled);
        assert_eq!(report.warnings.len(), 1, "{query}");
        assert!(
            report.warnings[0].starts_with(what),
            "{query}: {:?}",
            report.warnings
        );
        assert!(report.warnings[0].contains("지원하지 않습니다"));
    }
    // 지원하는 질의에는 경고가 없다
    assert!(run(root, "Name contains a").1.warnings.is_empty());
}

#[test]
fn lookup_inside_archive() {
    use td_archive::{CompositeFs, Source, ZipEdit};
    let tmp = tempfile::tempdir().unwrap();
    let zip = tmp.path().join("box.zip");
    let mut z = ZipEdit::create(&zip).unwrap();
    z.add_file(
        "docs/hello.txt",
        Source::Bytes(b"hello from the archive".to_vec()),
    );
    z.add_file("docs/other.txt", Source::Bytes(b"nothing here".to_vec()));
    z.add_file("big.txt", Source::Bytes(vec![b'z'; 3000]));
    z.add_file("bin.dat", Source::Bytes(b"hello\0bin".to_vec()));
    z.commit().unwrap();
    let root = VfsPath::new(format!("{}!", zip.display()));
    let fs = CompositeFs::default();
    let run = |query: &str, max: usize| {
        let mut found = Vec::new();
        let opts = SearchOptions {
            max_content_bytes: max,
            ..SearchOptions::default()
        };
        search(
            &fs,
            &root,
            &parse(query, now()).unwrap(),
            &opts,
            &CancelToken::new(),
            &mut |e| found.push(e.name.clone()),
        );
        found.sort();
        found
    };
    // 이름, 종류, 크기는 아카이브 목록 정보로, 본문은 앞부분만 읽어서 찾는다
    assert_eq!(run("Name contains hello", 1 << 20), ["hello.txt"]);
    assert_eq!(run("Folder", 1 << 20), ["docs"]);
    assert_eq!(run("Size > 2KB", 1 << 20), ["big.txt"]);
    assert_eq!(run("Content contains hello", 1 << 20), ["hello.txt"]); // bin.dat은 이진이라 제외
    assert_eq!(run("Content contains zzz", 1 << 20), ["big.txt"]);
    assert_eq!(run("Content contains zzz", 1000), Vec::<String>::new()); // 상한보다 큰 항목은 제외
}
