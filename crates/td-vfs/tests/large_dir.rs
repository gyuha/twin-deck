use std::time::Instant;

use td_vfs::{sort_entries, EntryKind, ListOptions, LocalFs, Vfs, VfsPath};

const N: usize = 100_000;

/// 10만 항목 디렉터리(가설 규모, docs/00 §3)의 목록 조회와 정렬 시간을 측정한다.
/// 값은 `cargo test -p td-vfs --release large_dir_100k_list -- --nocapture`로 볼 수 있다.
/// 임계값을 넘어도 이 테스트는 실패하지 않는다(정확성만 검사). 측정과 판정은 docs/m2-benchmark.md.
#[test]
fn large_dir_100k_list() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("big");
    std::fs::create_dir(&dir).unwrap();
    // 폴더 1%, 나머지는 빈 파일. 이름은 섞어서 만든다.
    for i in 0..N {
        let name = format!("item-{:06}", (i * 7919) % N);
        if i % 100 == 0 {
            std::fs::create_dir(dir.join(&name)).unwrap();
        } else {
            std::fs::File::create(dir.join(&name)).unwrap();
        }
    }

    let root = VfsPath::new(&dir);
    let t0 = Instant::now();
    let mut entries = LocalFs.list(&root, &ListOptions::default()).unwrap();
    let list_ms = t0.elapsed().as_secs_f64() * 1000.0;
    assert_eq!(entries.len(), N);

    let t1 = Instant::now();
    sort_entries(&mut entries);
    let sort_ms = t1.elapsed().as_secs_f64() * 1000.0;

    eprintln!("large_dir_100k_list: entries={N} list={list_ms:.0}ms sort={sort_ms:.0}ms");

    // 정확성: 폴더가 먼저, 각 구간은 이름순
    let first_file = entries
        .iter()
        .position(|e| e.kind != EntryKind::Dir)
        .unwrap();
    assert_eq!(first_file, N / 100);
    assert!(entries[..first_file]
        .iter()
        .all(|e| e.kind == EntryKind::Dir));
    assert!(entries[first_file..]
        .iter()
        .all(|e| e.kind != EntryKind::Dir));
    assert!(entries[..first_file]
        .windows(2)
        .all(|w| w[0].name <= w[1].name));
    assert!(entries[first_file..]
        .windows(2)
        .all(|w| w[0].name <= w[1].name));
}
