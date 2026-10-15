//! `td://별칭/경로`를 원격 데몬으로 라우팅하고 원격 파일을 로컬로 복사한다(ADR-0018).

use std::collections::BTreeMap;
use std::fs;
use std::sync::Arc;

use td_archive::CompositeFs;
use td_remote::{HostConfig, Server};
use td_vfs::{ListOptions, LocalFs, Vfs, VfsPath};

fn fs_with_office() -> CompositeFs {
    let server = Server::bind("127.0.0.1:0", "t".into(), Arc::new(LocalFs)).unwrap();
    let addr = server.local_addr().to_string();
    server.spawn();
    let fs = CompositeFs::default();
    let mut hosts = BTreeMap::new();
    hosts.insert(
        "office".to_string(),
        HostConfig {
            address: addr,
            token: "t".into(),
        },
    );
    fs.set_remote_hosts(hosts);
    fs
}

fn td(p: &std::path::Path) -> String {
    format!("td://office{}", p.display())
}

#[test]
fn 원격_경로의_목록과_stat은_원격_경로로_돌아온다() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), "원격").unwrap();
    fs::create_dir(dir.path().join("하위")).unwrap();
    let fs = fs_with_office();

    let root = VfsPath::new(td(dir.path()));
    let mut got = fs.list(&root, &ListOptions::default()).unwrap();
    got.sort_by(|a, b| a.name.cmp(&b.name));
    let names: Vec<_> = got.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(names, ["a.txt", "하위"]);
    assert_eq!(got[0].path, VfsPath::new(td(&dir.path().join("a.txt"))));
    // 원격 PC의 장치·inode는 이쪽에서 의미가 없다.
    assert!(got.iter().all(|e| e.file_id.is_none()));

    let st = fs
        .stat(&VfsPath::new(td(&dir.path().join("a.txt"))))
        .unwrap();
    assert_eq!(st.size, "원격".len() as u64);
    assert_eq!(st.path, VfsPath::new(td(&dir.path().join("a.txt"))));
    assert_eq!(
        fs.read_head(&VfsPath::new(td(&dir.path().join("a.txt"))), 100)
            .unwrap(),
        "원격".as_bytes()
    );
}

#[test]
fn 등록되지_않은_별칭은_알아볼_수_있는_오류다() {
    let fs = fs_with_office();
    let err = fs
        .list(&VfsPath::new("td://home/x"), &ListOptions::default())
        .unwrap_err();
    assert!(err.to_string().contains("home"), "{err}");
    assert!(err.to_string().contains("등록되지 않은"), "{err}");
}

#[test]
fn 원격_파일을_로컬로_복사한다() {
    let remote_dir = tempfile::tempdir().unwrap();
    let local_dir = tempfile::tempdir().unwrap();
    let data: Vec<u8> = (0..3 * 1024 * 1024u32).map(|i| (i % 253) as u8).collect();
    fs::write(remote_dir.path().join("big.bin"), &data).unwrap();
    let fs = fs_with_office();

    let to = VfsPath::new(local_dir.path().join("big.bin"));
    let n = fs
        .copy_file(&VfsPath::new(td(&remote_dir.path().join("big.bin"))), &to)
        .unwrap();
    assert_eq!(n, data.len() as u64);
    assert!(fs::read(to.as_path()).unwrap() == data);
}

#[test]
fn 원격_쓰기와_로컬에서_원격으로의_복사는_지원하지_않는다() {
    let remote_dir = tempfile::tempdir().unwrap();
    let local_dir = tempfile::tempdir().unwrap();
    fs::write(local_dir.path().join("a.txt"), "x").unwrap();
    let fs = fs_with_office();

    let new_dir = VfsPath::new(td(&remote_dir.path().join("새폴더")));
    let err = fs.mkdir(&new_dir).unwrap_err();
    assert!(err.to_string().contains("지원하지 않음"), "{err}");
    assert!(!remote_dir.path().join("새폴더").exists());
    // 원격 경로를 로컬 경로로 잘못 다뤄 `td:` 폴더를 만들면 안 된다.
    assert!(!std::path::Path::new("td:").exists());

    let err = fs
        .copy_file(
            &VfsPath::new(local_dir.path().join("a.txt")),
            &VfsPath::new(td(&remote_dir.path().join("a.txt"))),
        )
        .unwrap_err();
    assert!(err.to_string().contains("지원하지 않음"), "{err}");
    assert!(!fs.can_trash(&new_dir));
}
