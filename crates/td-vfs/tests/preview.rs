use base64::Engine;
use td_vfs::{read_preview, PreviewKind, PreviewLimits, VfsError, VfsPath};

fn file(dir: &tempfile::TempDir, name: &str, bytes: &[u8]) -> VfsPath {
    let p = dir.path().join(name);
    std::fs::write(&p, bytes).unwrap();
    VfsPath::new(p)
}

#[test]
fn preview_text_reads_prefix_only() {
    let tmp = tempfile::tempdir().unwrap();
    // 1MB 파일: 앞부분만 읽고 truncated. "한"(3바이트)이 한도 경계에 걸려도 깨진 글자 없이 끝난다.
    let big = "한글 미리보기\n".repeat(60_000);
    assert!(big.len() > 1_000_000);
    let p = file(&tmp, "big.txt", big.as_bytes());
    let pv = read_preview(&p, PreviewLimits::default()).unwrap();
    assert_eq!(pv.kind, PreviewKind::Text);
    assert!(pv.truncated);
    assert_eq!(pv.size, big.len() as u64);
    let text = pv.text.unwrap();
    assert!(
        text.len() <= 64 * 1024 && text.len() > 64 * 1024 - 4,
        "한도 근처까지: {}",
        text.len()
    );
    assert!(big.starts_with(&text), "앞부분과 정확히 일치");

    // 한도보다 작으면 전부, truncated 아님
    let small = file(&tmp, "small.md", "# 제목\n본문".as_bytes());
    let pv = read_preview(&small, PreviewLimits::default()).unwrap();
    assert_eq!(
        (pv.kind, pv.truncated, pv.text.as_deref()),
        (PreviewKind::Text, false, Some("# 제목\n본문"))
    );

    // 빈 파일도 텍스트
    let empty = file(&tmp, "empty", b"");
    let pv = read_preview(&empty, PreviewLimits::default()).unwrap();
    assert_eq!((pv.kind, pv.text.as_deref()), (PreviewKind::Text, Some("")));

    // 한도 안에서 실제로 읽는 양도 제한된다(작은 한도로 확인)
    let limits = PreviewLimits {
        text_bytes: 10,
        image_bytes: 100,
        ..PreviewLimits::default()
    };
    let pv = read_preview(&small, limits).unwrap();
    assert!(pv.truncated && pv.text.unwrap().len() <= 10);
}

#[test]
fn preview_image_data_url() {
    let tmp = tempfile::tempdir().unwrap();
    let bytes: Vec<u8> = (0u8..=255).collect();
    let p = file(&tmp, "pic.PNG", &bytes);
    let pv = read_preview(&p, PreviewLimits::default()).unwrap();
    assert_eq!(pv.kind, PreviewKind::Image);
    let url = pv.data_url.unwrap();
    let b64 = url
        .strip_prefix("data:image/png;base64,")
        .expect("mime 접두어");
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap(),
        bytes
    );
    assert_eq!(
        read_preview(&file(&tmp, "a.jpg", b"x"), PreviewLimits::default())
            .unwrap()
            .data_url
            .unwrap()
            .split(';')
            .next(),
        Some("data:image/jpeg")
    );
    assert!(
        read_preview(&file(&tmp, "a.svg", b"<svg/>"), PreviewLimits::default())
            .unwrap()
            .data_url
            .unwrap()
            .starts_with("data:image/svg+xml;base64,")
    );

    // 한도를 넘는 이미지는 싣지 않고 표시만 한다
    let limits = PreviewLimits {
        text_bytes: 64,
        image_bytes: 100,
        ..PreviewLimits::default()
    };
    let pv = read_preview(&file(&tmp, "huge.gif", &[0u8; 500]), limits).unwrap();
    assert_eq!(
        (pv.kind, pv.truncated, pv.data_url),
        (PreviewKind::Image, true, None)
    );
}

#[test]
fn preview_other_dir_and_errors() {
    let tmp = tempfile::tempdir().unwrap();
    // 바이너리(NUL 포함), 잘못된 UTF-8은 Other
    let bin = file(&tmp, "a.bin", &[0x50, 0x4b, 0x03, 0x00, 0x01]);
    assert_eq!(
        read_preview(&bin, PreviewLimits::default()).unwrap().kind,
        PreviewKind::Other
    );
    let bad = file(&tmp, "latin1.txt", &[0x63, 0x61, 0x66, 0xe9, 0x20, 0x61]);
    assert_eq!(
        read_preview(&bad, PreviewLimits::default()).unwrap().kind,
        PreviewKind::Other
    );

    // 폴더
    let dir = VfsPath::new(tmp.path());
    assert_eq!(
        read_preview(&dir, PreviewLimits::default()).unwrap().kind,
        PreviewKind::Directory
    );

    // 없는 파일
    let missing = VfsPath::new(tmp.path().join("nope"));
    assert!(matches!(
        read_preview(&missing, PreviewLimits::default()),
        Err(VfsError::NotFound(_))
    ));
}

#[test]
fn preview_pdf_data_url_and_limit() {
    let tmp = tempfile::tempdir().unwrap();
    let p = file(&tmp, "a.PDF", b"%PDF-1.4 x");
    let pv = read_preview(&p, PreviewLimits::default()).unwrap();
    assert_eq!(pv.kind, PreviewKind::Pdf);
    assert!(pv
        .data_url
        .unwrap()
        .starts_with("data:application/pdf;base64,"));
    assert!(!pv.truncated);
    // 한도를 넘으면 싣지 않고 truncated로 알린다
    let limits = PreviewLimits {
        pdf_bytes: 4,
        ..PreviewLimits::default()
    };
    let pv = read_preview(&p, limits).unwrap();
    assert_eq!(pv.kind, PreviewKind::Pdf);
    assert!(pv.data_url.is_none() && pv.truncated);
}

/// 한도(10MB)짜리 PDF를 읽고 base64로 바꾸는 시간을 잰다. 느리면 PDF 미리보기를 적용하지 않는다는 기준의 측정.
#[test]
#[ignore = "측정용"]
fn measure_pdf_preview_cost() {
    let tmp = tempfile::tempdir().unwrap();
    let mut data = b"%PDF-1.7\n".to_vec();
    data.extend((0..10 * 1024 * 1024 - 9).map(|i| (i * 31 % 251) as u8));
    let p = file(&tmp, "big.pdf", &data);
    for _ in 0..3 {
        let t = std::time::Instant::now();
        let pv = read_preview(&p, PreviewLimits::default()).unwrap();
        println!(
            "10MB pdf: {:?}, data_url {} bytes",
            t.elapsed(),
            pv.data_url.unwrap().len()
        );
    }
}
