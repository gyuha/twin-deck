<!-- forge-slug: ops-overwrite-safety-fix -->
<!-- task: 142 -->
<!-- generated-by: fg-adversarial-review -->
<!-- priority: high -->
<!-- tdd: on -->
# 덮어쓰기·이동에서 원본·대상이 사라지는 문제를 막는다 (td-ops)

## 목표 / 비목표
- 목표: 적대적 리뷰(복사·이동·삭제)에서 재현된 데이터 유실 경로를 `crates/td-ops`에서 닫는다. 같은 뿌리인 (1) "같은 파일/조상/하위" 판정이 경로 문자열 비교뿐이라는 점, (2) Overwrite가 대상을 먼저 영구 삭제한다는 점, (3) 이동 폴백이 모든 I/O 오류에서 도는 점을 고친다.
- 비목표: 폴더끼리 Overwrite의 병합 동작(대상 폴더를 통째로 교체하는 현재 의미는 유지, 단 실패하면 복원), UI 알림(별도 계획 `transfer-failure-notice-fix`), `td-archive`의 `File::create` 선행(아카이브→로컬 복사), 삭제의 오류 수집(`delete_entry`), 큐 워커 `catch_unwind`, mtime·폴더 권한 보존, Windows 예약 이름. 이 항목들은 리뷰에 기록만 하고 이번에는 건드리지 않는다.

## 근거(재현된 사실)
- `ops.rs:209-214` `resolve_dest`: `remove_any(&dest)`가 복사·이동보다 먼저 실행된다. `chmod 000` 원본으로 Overwrite 복사 → 기존 대상이 사라지고 `PermissionDenied`.
- `ops.rs:210` `&dest == src`, `ops.rs:538` `src.parent() == dest_dir`는 경로 문자열 비교다. macOS(APFS)에서 `d/foo.txt`를 `D`로 Overwrite 복사하면 원본이 삭제되고 `NotFound`.
- 조상 삭제: `/x/a/a`를 `/x`로 Overwrite 복사·이동하면 `dest=/x/a`가 `src`의 조상인데 `check_not_inside`(`ops.rs:259`)는 반대 방향만 본다 → `remove_any(/x/a)`가 원본째 지운다(코드 확인, 문자열만으로 성립하므로 대소문자 무시 FS가 아니어도 발생).
- `ops.rs:259-266` `check_not_inside`는 `starts_with` 문자열 비교뿐이라 `s`를 `S/sub`로 복사하면 `ENAMETOOLONG`까지 중첩 폴더를 만든다.
- 압축: `default_zip_name`이 원본 `foo.zip` 하나를 같은 폴더에 압축할 때 `foo.zip`을 만든다. `resolve_name`(`ops.rs:242`)이 원본 존재 확인(`ops.rs:431`)보다 먼저 `remove_any`를 호출해 원본이 삭제된다.
- `ops.rs:545-557`: `rename`이 `VfsError::Io` 전반(EACCES 포함)에서 복사 후 삭제로 폴백한다. EXDEV(교차 볼륨)일 때만이어야 한다.

## 원천(Source of truth)
- 용어: 없음(.forge/CONTEXT.md 참조 용어 없음)
- 관련 ADR: 없음
- 완료 정의(DoD):
  1. `cargo test -p td-ops` 전체 통과, `cargo clippy -p td-ops -- -D warnings` 통과, `cargo fmt --check` 통과.
  2. 아래 회귀 테스트가 `crates/td-ops/tests/ops.rs`(또는 `tests/` 아래 새 파일)에 있고, **수정 전 코드에서 빨강(실패)임을 먼저 실행해 확인한 기록이 `run.md`에 있으며**, 수정 후 초록이다(red → green). 각 항목은 이름 필터로 `cargo test -p td-ops <이름>` 실행이 가능해야 한다.
     - 조상 덮어쓰기(`/x/a/a` → `/x`, Overwrite)가 copy·move 모두 오류를 돌려주고 `/x/a/a`와 `/x/a`가 그대로 남는다.
     - 같은 파일 판정: `#[cfg(target_os = "macos")]`에서 대소문자만 다른 폴더 경로로 Overwrite copy·move 시 원본이 남는다. 심볼릭 링크 폴더를 경유한 같은 폴더도 같다(unix).
     - 자기 하위 복사: 대소문자만 다른 경로(macOS)와 폴더 링크 경로(unix)로 복사하면 `DestInsideSource`이고 대상에 새 폴더가 생기지 않는다.
     - 압축: `foo.zip` 하나를 같은 폴더에서 이름 없이 Overwrite로 압축해도 원본 `foo.zip`이 남는다(오류를 돌려줘도 되고 Rename으로 바꿔도 된다. 둘 중 하나는 `run.md`에 적는다).
     - Overwrite 실패 시 대상 보존(unix, root가 아닐 때): 대상에 "OLD"를 두고 `chmod 000` 원본을 Overwrite 복사하면 오류가 나더라도 대상 내용이 "OLD"다. 이동과 폴더 대상 버전도 같다. 중단(`Control::should_stop`)했을 때도 기존 대상이 복원된다.
     - 이동 폴백 한정(unix, root가 아닐 때): 원본 폴더를 쓰기 불가(`chmod 555`)로 두어 `rename`이 EACCES로 실패하게 하면, 대상에 사본이 만들어지지 않는다.
  3. 기존 테스트 중 `copy_into_own_child_rejected`, `conflict_overwrite`, 같은 파일 Overwrite 테스트(`SameFile`), `move_dir_keeps_source_when_some_files_fail_to_copy`가 그대로 통과한다(회귀 방지용이라 수정 전에도 통과하는 게 정상).
  4. 사이트 열거 — Overwrite로 기존 대상을 지우는 곳은 `resolve_dest`, `resolve_name`, `extract_with`의 실패 정리 3곳이다. `grep -n "remove_any(&dest)" crates/td-ops/src/ops.rs`로 남은 곳을 확인해, 남아 있으면 각각 "성공 확인 후 삭제" 경로이거나 복원 경로임을 `run.md`에 적는다. (사전 상태: 현재 2곳이 일치하므로 `→ 0`이 아니라 위 목록 확인이 기준이다.)

## 작업 조각(Work slices)
- [ ] S1. 위 DoD 2의 회귀 테스트를 먼저 작성하고, 현재 코드에서 **실패함을 실행해 확인**한다. 실패 출력 요약을 `run.md`에 남긴다. — 완료 기준: 새 테스트가 전부 수정 전 코드에서 빨강이다(이미 통과하는 항목이 있으면 이유를 적는다).
- [ ] S2. "같은 파일 / 조상 / 하위" 판정을 경로 문자열 비교에서 실제 동일성 비교로 바꾼다. `Entry.file_id`(dev, ino)가 있으면 그것으로, 없거나 심볼릭 링크 경유면 `canonicalize` 가능한 로컬 경로에 한해 정규화해 비교한다(아카이브 경로는 기존 방식 유지). 적용 지점: `resolve_dest`의 Overwrite 가드, `check_not_inside`, `move_with`의 같은 폴더 판정, `src`의 조상을 `dest`로 덮어쓰는 경우 거부, 압축 결과 이름이 원본과 같은 경우. — 완료 기준: DoD 2의 조상·같은 파일·자기 하위·압축 테스트가 초록. (depends: S1)
- [ ] S3. Overwrite를 "대상을 옆으로 치워 두고(같은 폴더 임시 이름으로 rename) 작업이 끝나면 지우고, 실패·중단하면 되돌리는" 방식으로 바꾼다. 파일·폴더 모두 적용하고, copy·move·compress·extract가 같은 경로를 쓴다. 임시 이름은 기존 이름과 충돌하지 않게 하고, 되돌리지 못하는 극단(복원 rename 실패)은 오류 메시지에 임시 이름 위치를 포함한다. — 완료 기준: DoD 2의 Overwrite 실패 시 보존 테스트가 초록, DoD 4 확인. (depends: S2)
- [ ] S4. 이동 폴백을 EXDEV(교차 볼륨, `ErrorKind::CrossesDevices` 또는 raw os error)일 때만 타게 한다. 그 밖의 `Io` 오류는 그대로 오류로 돌려준다. — 완료 기준: DoD 2의 이동 폴백 한정 테스트가 초록, 교차 볼륨 이동 기존 테스트가 있으면 그대로 통과. (depends: S3)
- [ ] S5. `docs/`에 복사·이동 충돌 동작을 설명한 곳이 있으면(`grep -rn "덮어" docs/*.md`) Overwrite가 실패하면 대상이 복원된다는 문장으로 맞춘다. 없으면 건너뛰고 `run.md`에 "없음"이라 적는다. — 완료 기준: grep 결과와 처리 결과가 `run.md`에 있다. (depends: S3)

## 메모
- 테스트가 root로 실행되면 `chmod` 기반 테스트는 의미가 없다. `libc::geteuid() == 0`이면 건너뛰도록 하되, 건너뛴 사실이 테스트 출력에 보이게 한다(조용한 통과 금지).
- 심볼릭 링크 경유 비교는 로컬 경로에서만 `std::fs::canonicalize`를 쓴다. `Ops`는 이미 `as_path()`로 로컬 경로를 다루는 곳(`default_zip_name`)이 있다.
- 검증 한계: Windows 동작은 컴파일 검증만 된다(AGENTS.md). 대소문자 무시 테스트는 macOS에서만 의미가 있어 `cfg`로 나눈다.
