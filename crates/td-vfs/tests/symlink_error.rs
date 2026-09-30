use td_vfs as vfs;

#[test]
fn symlink_error_message() {
    // Windows: 권한 오류는 원인과 해결 방법이 든 안내가 된다
    let privilege = vfs::symlink_error_message(true, 1314).unwrap();
    assert!(
        privilege.contains("권한") && privilege.contains("개발자 모드"),
        "{privilege}"
    );
    assert!(vfs::symlink_error_message(true, 5)
        .unwrap()
        .contains("접근이 거부"));
    assert!(vfs::symlink_error_message(true, 50)
        .unwrap()
        .contains("FAT"));
    assert!(vfs::symlink_error_message(true, 183)
        .unwrap()
        .contains("이미"));
    assert!(vfs::symlink_error_message(true, 80)
        .unwrap()
        .contains("이미"));
    assert!(vfs::symlink_error_message(true, 3)
        .unwrap()
        .contains("찾을 수 없"));
    // 서로 다른 원인은 서로 다른 문구
    assert_ne!(
        vfs::symlink_error_message(true, 1314),
        vfs::symlink_error_message(true, 50)
    );
    // 유닉스 errno
    assert!(vfs::symlink_error_message(false, 13)
        .unwrap()
        .contains("권한"));
    assert!(vfs::symlink_error_message(false, 1)
        .unwrap()
        .contains("권한"));
    assert!(vfs::symlink_error_message(false, 17)
        .unwrap()
        .contains("이미"));
    assert!(vfs::symlink_error_message(false, 30)
        .unwrap()
        .contains("읽기 전용"));
    // 같은 숫자라도 플랫폼이 다르면 뜻이 다르다: Windows 1314는 유닉스 errno가 아니다
    assert_eq!(vfs::symlink_error_message(false, 1314), None);
    // 모르는 코드는 안내 없이 None(호출자가 원래 오류를 그대로 쓴다)
    assert_eq!(vfs::symlink_error_message(true, 999_999), None);
    assert_eq!(vfs::symlink_error_message(false, -1), None);
}
