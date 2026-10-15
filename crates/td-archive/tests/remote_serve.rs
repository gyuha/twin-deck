//! 원격 데몬이 `CompositeFs`를 내보내면 원격 안의 아카이브도 원격이 풀어서 보낸다(ADR-0018).

use std::fs;
use std::io::Write;
use std::sync::Arc;

use td_archive::CompositeFs;
use td_remote::{RemoteFs, Server};
use td_vfs::{ListOptions, Vfs, VfsPath};

#[test]
fn 원격_아카이브_안_파일을_목록과_read_to로_받는다() {
    let dir = tempfile::tempdir().unwrap();
    let zip_path = dir.path().join("a.zip");
    let mut w = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
    w.start_file("docs/readme.md", zip::write::SimpleFileOptions::default())
        .unwrap();
    w.write_all("원격 아카이브 안".as_bytes()).unwrap();
    w.finish().unwrap();

    let server = Server::bind("127.0.0.1:0", "t".into(), Arc::new(CompositeFs::default())).unwrap();
    let addr = server.local_addr().to_string();
    server.spawn();
    let remote = RemoteFs::connect(&addr, "t").unwrap();

    let inner = format!("{}!/docs", zip_path.display());
    let names: Vec<String> = remote
        .list(&VfsPath::new(&inner), &ListOptions::default())
        .unwrap()
        .into_iter()
        .map(|e| e.name)
        .collect();
    assert_eq!(names, ["readme.md"]);

    let mut out = Vec::new();
    remote
        .read_to(&VfsPath::new(format!("{inner}/readme.md")), &mut out)
        .unwrap();
    assert_eq!(out, "원격 아카이브 안".as_bytes());
}
