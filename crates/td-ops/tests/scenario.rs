mod common;

use common::*;
use td_ops::ConflictPolicy;

/// 활성 패널(a) → 비활성 패널(b)로 복사, 이동, 이름 변경, 삭제를 이어서 수행한다.
#[test]
fn keyboard_flow_copy_move_rename_delete() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("docs")).unwrap();
    write(&f.a.join("docs/note.txt"), "note");
    write(&f.a.join("report.txt"), "report");
    write(&f.a.join("junk.txt"), "junk");

    // F5: 복사
    f.ops
        .copy(&f.a.join("report.txt"), &f.b, ConflictPolicy::Rename)
        .unwrap();
    // F6: 이동
    f.ops
        .move_to(&f.a.join("docs"), &f.b, ConflictPolicy::Rename)
        .unwrap();
    // Shift+F6: 이름 변경
    let renamed = f.ops.rename(&f.b.join("report.txt"), "final.txt").unwrap();
    // F8: 휴지통, Shift+F8: 영구 삭제
    f.ops.trash(&f.a.join("junk.txt")).unwrap();
    f.ops.delete(&f.b.join("docs")).unwrap();

    assert_eq!(read(&renamed), "report");
    assert_eq!(read(&f.a.join("report.txt")), "report");
    assert!(!f.a.join("docs").as_path().exists());
    assert!(!f.a.join("junk.txt").as_path().exists());
    assert!(f.bin.join("junk.txt").exists());
    assert!(!f.b.join("docs").as_path().exists());
    assert!(!f.b.join("report.txt").as_path().exists());
}
