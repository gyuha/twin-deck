//! 덮어쓰기·이동·압축에서 원본이나 기존 대상이 사라지지 않는지 본다(적대적 리뷰에서 재현된 경우).
mod common;

use std::cell::Cell;

use common::*;
use td_ops::{ConflictPolicy, Control, NoControl, OpsError};
use td_vfs::VfsPath;

/// 처음 `n`번 확인한 뒤부터 중단을 요청하는 제어.
struct StopAfter(Cell<usize>);

impl Control for StopAfter {
    fn on_item(&self, _path: &VfsPath) {}
    fn should_stop(&self) -> bool {
        let left = self.0.get();
        if left == 0 {
            return true;
        }
        self.0.set(left - 1);
        false
    }
}

#[cfg(unix)]
fn chmod(p: &VfsPath, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(p.as_path(), std::fs::Permissions::from_mode(mode)).unwrap();
}

/// root이거나 권한이 무시되는 환경이면 chmod 기반 시나리오가 성립하지 않는다. 건너뛴 사실은 출력에 남긴다.
#[cfg(unix)]
fn permissions_enforced(unreadable: &VfsPath) -> bool {
    let enforced = std::fs::File::open(unreadable.as_path()).is_err();
    if !enforced {
        eprintln!("건너뜀: 이 환경에서는 chmod 000 파일을 읽을 수 있다(root?)");
    }
    enforced
}

#[test]
fn overwrite_ancestor_of_source_is_refused_on_copy() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("p/p")).unwrap();
    write(&f.a.join("p/p/f.txt"), "keep");
    let err = f
        .ops
        .copy(&f.a.join("p/p"), &f.a, ConflictPolicy::Overwrite)
        .unwrap_err();
    assert!(
        matches!(err, OpsError::SourceInsideDest(_) | OpsError::SameFile(_)),
        "{err:?}"
    );
    assert_eq!(read(&f.a.join("p/p/f.txt")), "keep");
}

#[test]
fn overwrite_ancestor_of_source_is_refused_on_move() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("p/p")).unwrap();
    write(&f.a.join("p/p/f.txt"), "keep");
    let err = f
        .ops
        .move_to(&f.a.join("p/p"), &f.a, ConflictPolicy::Overwrite)
        .unwrap_err();
    assert!(
        matches!(err, OpsError::SourceInsideDest(_) | OpsError::SameFile(_)),
        "{err:?}"
    );
    assert_eq!(read(&f.a.join("p/p/f.txt")), "keep");
}

/// 폴더 심볼릭 링크를 거쳐 같은 파일을 가리키는 경로로 덮어쓰면 원본이 지워졌다.
#[cfg(unix)]
#[test]
fn overwrite_same_file_through_symlinked_dir_keeps_source() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    write(&f.a.join("d/foo.txt"), "keep");
    std::os::unix::fs::symlink(f.a.join("d").as_path(), f.a.join("lnk").as_path()).unwrap();
    for copy in [true, false] {
        let r = if copy {
            f.ops.copy(
                &f.a.join("d/foo.txt"),
                &f.a.join("lnk"),
                ConflictPolicy::Overwrite,
            )
        } else {
            f.ops.move_to(
                &f.a.join("d/foo.txt"),
                &f.a.join("lnk"),
                ConflictPolicy::Overwrite,
            )
        };
        assert!(
            r.is_err() || matches!(r, Ok(td_ops::Outcome::Skipped)),
            "{r:?}"
        );
        assert_eq!(read(&f.a.join("d/foo.txt")), "keep", "copy={copy}");
    }
}

/// 대소문자만 다른 철자로 같은 폴더를 가리킨다(macOS 기본 APFS는 대소문자를 구분하지 않는다).
#[cfg(target_os = "macos")]
#[test]
fn overwrite_same_file_with_other_case_spelling_keeps_source() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    write(&f.a.join("d/foo.txt"), "keep");
    let r = f.ops.copy(
        &f.a.join("d/foo.txt"),
        &f.a.join("D"),
        ConflictPolicy::Overwrite,
    );
    assert!(
        r.is_err() || matches!(r, Ok(td_ops::Outcome::Skipped)),
        "{r:?}"
    );
    assert_eq!(read(&f.a.join("d/foo.txt")), "keep");
    let r = f.ops.move_to(
        &f.a.join("d/foo.txt"),
        &f.a.join("D"),
        ConflictPolicy::Overwrite,
    );
    assert!(
        r.is_err() || matches!(r, Ok(td_ops::Outcome::Skipped)),
        "{r:?}"
    );
    assert_eq!(read(&f.a.join("d/foo.txt")), "keep");
}

#[cfg(target_os = "macos")]
#[test]
fn copy_into_own_child_with_other_case_is_rejected() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("s/sub")).unwrap();
    let err = f
        .ops
        .copy(&f.a.join("s"), &f.a.join("S/sub"), ConflictPolicy::Rename)
        .unwrap_err();
    assert!(matches!(err, OpsError::DestInsideSource(_)), "{err:?}");
    assert!(!f.a.join("s/sub/s").as_path().exists());
}

#[cfg(unix)]
#[test]
fn copy_into_own_child_through_symlink_is_rejected() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("t/inner")).unwrap();
    std::os::unix::fs::symlink(f.a.join("t/inner").as_path(), f.a.join("lnk").as_path()).unwrap();
    let err = f
        .ops
        .copy(&f.a.join("t"), &f.a.join("lnk"), ConflictPolicy::Rename)
        .unwrap_err();
    assert!(matches!(err, OpsError::DestInsideSource(_)), "{err:?}");
    assert!(!f.a.join("t/inner/t").as_path().exists());
}

#[test]
fn compress_overwrite_never_deletes_its_own_source() {
    let f = fixture();
    write(&f.a.join("foo.zip"), "not really a zip");
    let r = f.ops.compress_with(
        &[f.a.join("foo.zip")],
        &f.a,
        None,
        ConflictPolicy::Overwrite,
        &NoControl,
    );
    assert!(
        r.is_err() || matches!(r, Ok(td_ops::Outcome::Done(ref p)) if p != &f.a.join("foo.zip"))
    );
    assert_eq!(read(&f.a.join("foo.zip")), "not really a zip");
}

#[cfg(unix)]
#[test]
fn overwrite_copy_failure_keeps_old_file_target() {
    let f = fixture();
    write(&f.a.join("x.txt"), "NEW");
    write(&f.b.join("x.txt"), "OLD");
    chmod(&f.a.join("x.txt"), 0o000);
    if !permissions_enforced(&f.a.join("x.txt")) {
        chmod(&f.a.join("x.txt"), 0o644);
        return;
    }
    let r = f
        .ops
        .copy(&f.a.join("x.txt"), &f.b, ConflictPolicy::Overwrite);
    chmod(&f.a.join("x.txt"), 0o644);
    assert!(r.is_err());
    assert_eq!(read(&f.b.join("x.txt")), "OLD");
}

#[cfg(unix)]
#[test]
fn overwrite_copy_failure_keeps_old_dir_target() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    write(&f.a.join("d/ok.txt"), "ok");
    write(&f.a.join("d/secret.txt"), "s");
    chmod(&f.a.join("d/secret.txt"), 0o000);
    f.ops.mkdir(&f.b.join("d")).unwrap();
    write(&f.b.join("d/old.txt"), "OLD");
    if !permissions_enforced(&f.a.join("d/secret.txt")) {
        chmod(&f.a.join("d/secret.txt"), 0o644);
        return;
    }
    let r = f.ops.copy(&f.a.join("d"), &f.b, ConflictPolicy::Overwrite);
    chmod(&f.a.join("d/secret.txt"), 0o644);
    assert!(r.is_err());
    assert_eq!(read(&f.b.join("d/old.txt")), "OLD");
    assert!(
        !f.b.join("d/ok.txt").as_path().exists(),
        "부분 복사물이 남았다"
    );
    // 치워 뒀던 임시 이름이 남지 않는다.
    assert_eq!(std::fs::read_dir(f.b.as_path()).unwrap().count(), 1);
}

#[test]
fn overwrite_copy_aborted_restores_old_dir_target() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    for n in ["1", "2", "3"] {
        write(&f.a.join(&format!("d/{n}.txt")), n);
    }
    f.ops.mkdir(&f.b.join("d")).unwrap();
    write(&f.b.join("d/old.txt"), "OLD");
    let err = f
        .ops
        .copy_with(
            &f.a.join("d"),
            &f.b,
            ConflictPolicy::Overwrite,
            &StopAfter(Cell::new(2)),
        )
        .unwrap_err();
    assert!(matches!(err, OpsError::Aborted), "{err:?}");
    assert_eq!(read(&f.b.join("d/old.txt")), "OLD");
    assert_eq!(std::fs::read_dir(f.b.as_path()).unwrap().count(), 1);
}

#[test]
fn overwrite_success_replaces_and_leaves_no_temp_names() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    write(&f.a.join("d/new.txt"), "NEW");
    f.ops.mkdir(&f.b.join("d")).unwrap();
    write(&f.b.join("d/old.txt"), "OLD");
    f.ops
        .copy(&f.a.join("d"), &f.b, ConflictPolicy::Overwrite)
        .unwrap();
    assert_eq!(read(&f.b.join("d/new.txt")), "NEW");
    assert!(!f.b.join("d/old.txt").as_path().exists());
    assert_eq!(std::fs::read_dir(f.b.as_path()).unwrap().count(), 1);
}

/// 원본 폴더에 쓸 수 없어 rename이 EACCES로 실패하면 교차 볼륨 폴백(복사 후 삭제)으로 넘어가면 안 된다.
#[cfg(unix)]
#[test]
fn move_does_not_fall_back_to_copy_on_permission_error() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("p")).unwrap();
    write(&f.a.join("p/x.txt"), "src");
    chmod(&f.a.join("p"), 0o555);
    if std::fs::File::create(f.a.join("p/probe").as_path()).is_ok() {
        chmod(&f.a.join("p"), 0o755);
        eprintln!("건너뜀: 이 환경에서는 읽기 전용 폴더에 쓸 수 있다(root?)");
        return;
    }
    let r = f
        .ops
        .move_to(&f.a.join("p/x.txt"), &f.b, ConflictPolicy::Rename);
    chmod(&f.a.join("p"), 0o755);
    assert!(r.is_err());
    assert_eq!(read(&f.a.join("p/x.txt")), "src");
    assert!(!f.b.join("x.txt").as_path().exists(), "사본이 만들어졌다");
}

#[cfg(unix)]
#[test]
fn move_overwrite_keeps_old_target_when_rename_fails() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("p")).unwrap();
    write(&f.a.join("p/x.txt"), "src");
    write(&f.b.join("x.txt"), "OLD");
    chmod(&f.a.join("p"), 0o555);
    if std::fs::File::create(f.a.join("p/probe").as_path()).is_ok() {
        chmod(&f.a.join("p"), 0o755);
        eprintln!("건너뜀: 이 환경에서는 읽기 전용 폴더에 쓸 수 있다(root?)");
        return;
    }
    let r = f
        .ops
        .move_to(&f.a.join("p/x.txt"), &f.b, ConflictPolicy::Overwrite);
    chmod(&f.a.join("p"), 0o755);
    assert!(r.is_err());
    assert_eq!(read(&f.b.join("x.txt")), "OLD");
    assert_eq!(read(&f.a.join("p/x.txt")), "src");
}

/// 작업 큐처럼 항목 오류를 모으는 제어. 이때 `copy_with`는 일부가 실패해도 `Ok`를 돌려준다.
struct Collecting;

impl Control for Collecting {
    fn on_item(&self, _path: &VfsPath) {}
    fn should_stop(&self) -> bool {
        false
    }
    fn collects_errors(&self) -> bool {
        true
    }
}

#[cfg(unix)]
#[test]
fn overwrite_copy_with_collected_item_errors_restores_old_dir_target() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    write(&f.a.join("d/ok.txt"), "ok");
    write(&f.a.join("d/secret.txt"), "s");
    chmod(&f.a.join("d/secret.txt"), 0o000);
    f.ops.mkdir(&f.b.join("d")).unwrap();
    write(&f.b.join("d/old.txt"), "OLD");
    if !permissions_enforced(&f.a.join("d/secret.txt")) {
        chmod(&f.a.join("d/secret.txt"), 0o644);
        return;
    }
    let r = f
        .ops
        .copy_with(&f.a.join("d"), &f.b, ConflictPolicy::Overwrite, &Collecting);
    chmod(&f.a.join("d/secret.txt"), 0o644);
    assert!(matches!(r, Err(OpsError::OverwriteRolledBack(1))), "{r:?}");
    assert_eq!(read(&f.b.join("d/old.txt")), "OLD");
    assert!(!f.b.join("d/ok.txt").as_path().exists());
    assert_eq!(std::fs::read_dir(f.b.as_path()).unwrap().count(), 1);
}

/// Overwrite가 아닐 때는 기존 동작 그대로 일부 실패가 `Ok`로 끝난다(오류는 `on_error`로 알린다).
#[cfg(unix)]
#[test]
fn rename_policy_with_collected_item_errors_still_returns_ok() {
    let f = fixture();
    f.ops.mkdir(&f.a.join("d")).unwrap();
    write(&f.a.join("d/ok.txt"), "ok");
    write(&f.a.join("d/secret.txt"), "s");
    chmod(&f.a.join("d/secret.txt"), 0o000);
    if !permissions_enforced(&f.a.join("d/secret.txt")) {
        chmod(&f.a.join("d/secret.txt"), 0o644);
        return;
    }
    let r = f
        .ops
        .copy_with(&f.a.join("d"), &f.b, ConflictPolicy::Rename, &Collecting);
    chmod(&f.a.join("d/secret.txt"), 0o644);
    assert!(r.is_ok(), "{r:?}");
    assert_eq!(read(&f.b.join("d/ok.txt")), "ok");
}
