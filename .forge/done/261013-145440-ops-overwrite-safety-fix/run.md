<!-- forge-slug: ops-overwrite-safety-fix -->
# 실행 기록 — 덮어쓰기·이동에서 원본·대상이 사라지는 문제를 막는다 (td-ops)

## 조각별 결과
- S1 회귀 테스트 먼저 작성, 수정 전 빨강 확인 — ✅ as planned (15개 중 수정 전 12개 실패 → 아래 참고)
- S2 같은 파일/조상/하위 판정을 실제 위치 비교로 — ✅ as planned (`file_id` + `canonicalize` + 조상 순회)
- S3 Overwrite를 "치워 두고 → 성공하면 삭제 / 실패·중단하면 복원"으로 — ⚠ 계획보다 넓게: 오류를 모으는 큐 모드(`copy_with`가 일부 실패해도 `Ok`)도 복원해야 해서 `OpsError::OverwriteRolledBack` 변종을 더했다
- S4 이동 폴백을 EXDEV로 한정 — ⚠ 기존 테스트 도우미 `NoRenameFs`가 종류 없는 오류(`io::Error::other`)로 "교차 볼륨"을 흉내 내고 있어 `ErrorKind::CrossesDevices`로 고쳤다(기대값은 그대로)
- S5 문서 — ✅ `docs/08-vfs-file-ops.md` 3.2절 아래에 구현 상태 4줄 추가. `grep -rn "덮어" docs/*.md`로 본 다른 곳은 충돌 동작 설명이 아니라 해당 없음

## 수정 전 빨강 증거 (S1)
`cargo test -p td-ops --test overwrite_safety` (수정 전 코드, 에러 변종 `SourceInsideDest`만 먼저 추가한 상태): `1 passed; 12 failed`.
- 실패 12: 조상 덮어쓰기(copy·move), 심볼릭 링크 폴더 경유 같은 파일, 대소문자 철자 같은 파일(macOS), 자기 하위 복사(대소문자·링크), 압축 자기 원본, 덮어쓰기 복사 실패 시 파일·폴더 대상 유실, 중단 시 폴더 대상 유실, 이동 폴백(권한 오류), 이동 Overwrite 후 rename 실패.
- 통과 1: `overwrite_success_replaces_and_leaves_no_temp_names` — 성공 경로 대조군이라 수정 전에도 통과하는 것이 정상(회귀 방지용).
- 실패 원인은 `tests/common/mod.rs:59`의 `read`가 지워진 파일을 읽으려다 난 패닉, 또는 오류가 나야 하는데 `Ok`가 돌아온 것으로, 의도한 유실이 실제로 재현된 것이다.
- 이후 오류 수집 모드 테스트 2개를 추가해 총 15개(수정 후 15/15 초록).

## DoD 기준값 → 실행 후
1. `cargo test -p td-ops` 전체 → 전부 통과. `cargo clippy -p td-ops -- -D warnings` → 경고 없음. `cargo fmt --check -p td-ops` → 통과. 관련 크레이트(`td-vfs`, `td-queue`, `td-archive`)와 `cargo check --workspace`도 통과.
2. 회귀 테스트 → 수정 전 12 빨강 → 수정 후 15/15 초록. 압축 항목은 "오류를 돌려주거나 Rename" 중 **오류(`SameFile`)를 돌려주는 쪽**으로 구현됐다(`check_overwritable`이 `resolve_name`에서 거부).
3. 기존 테스트 → 수정 전에도, 후에도 통과(단 `move_dir_keeps_source_when_some_files_fail_to_copy`는 아래 도우미 수정 후에 통과).
4. `grep -n "remove_any(&dest)" crates/td-ops/src/ops.rs` → 2곳 → **0곳**. 남은 `remove_any(dest)`는 `rollback`이 이번 작업이 만든 부분 결과를 치우는 곳 하나뿐이다.

## 결정과 발견
- 같은 파일 판정은 `Ops`가 이미 로컬 경로에 의존하는 곳(`default_zip_name`)이 있어 `std::fs::canonicalize`를 로컬 경로에 한해 쓴다. 아카이브 경로는 정규화가 실패하면 원래 경로 비교로 돌아간다.
- 압축·추출의 `resolve_name`에 원본 목록을 넘겨, 추출 폴더가 원본 아카이브의 조상일 때(`/x/a/a.tar`를 `/x`에 `a`로 풀며 Overwrite)도 막는다. 리뷰 보고에는 없던 같은 뿌리의 경우다.
- 옛 대상을 치우는 `discard`가 실패해도 작업은 성공으로 본다(숨김 임시 이름이 남을 수 있음). 되돌리기 자체가 실패하면 `OpsError::RestoreFailed`가 옛 내용이 있는 경로를 알려 준다.
- 하드 링크는 같은 inode로 같은 항목으로 본다(한쪽 위에 다른 쪽을 덮어쓰면 `fs::copy`가 내용을 잘라 버리기 때문).

## 검증하지 못한 것
- 실제 교차 볼륨(EXDEV) 이동은 실행하지 못했다. `NoRenameFs`가 같은 종류의 오류를 내서 폴백 경로만 검증했다.
- Windows는 컴파일 검증만 된다(`crosses_devices`의 Windows 분기는 ERROR_NOT_SAME_DEVICE=17을 가정, 미확인).
- 실제 앱(큐 → UI)에서 "덮어쓰기 실패 후 복원"이 어떻게 보이는지는 눈으로 확인하지 못했다. 실패는 큐의 항목 오류로 나가고 UI 알림은 #143에서 다룬다.

## 뒤늦게 발견한 교차 영향 (#143 실행 중)
- `cd apps/desktop && bunx vitest run` 전체를 돌렸을 때 `i18n-rust-messages.test.ts`가 실패했다. 이 계획이 `crates/td-ops/src/error.rs`에 추가한 한국어 오류 문구 3개(`SourceInsideDest`, `OverwriteRolledBack`, `RestoreFailed`)가 `apps/desktop/src/i18n/rust.ts` 대응표에 없었다. 위 DoD 1은 `cargo`만 확인해서 이 실패를 놓쳤다.
- `rust.ts`에 영어 번역 3줄을 추가해 해결했다. 이후 `bun run test` 전체(desktop 151 파일/1236 테스트 포함)와 `cargo test --workspace`(346개) 통과.
- 교훈(회고 재료): Rust에서 사용자에게 보이는 오류 문구를 추가하면 `rust.ts` 대응표도 같이 바꿔야 한다. 이 계획의 DoD에 그 확인이 없었고, 계획 단계에서 `grep -rn "한국어 리터럴" apps/desktop/src/__tests__`로 알 수 있었다.
