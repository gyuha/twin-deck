<!-- forge-slug: review-followups-fix -->
# 실행 기록 — 코드 리뷰 지적 4건을 고친다 (압축 임시 파일 혼입 · 치워 둔 이름 · 성능 · 이동 순서)

## 조각별 결과
- S1 회귀 테스트 3개 먼저 작성, 수정 전 빨강 확인 — ⚠ 처음 빨강 중 이동·이름 테스트 2개는 **잘못된 이유**였다. 테스트 가짜 `NoRenameFs`가 모든 `rename`을 막아 치워 두기(`displace`) 단계에서 먼저 실패했기 때문이다(옛 대상이 그대로 남아 빨강). 가짜를 고친 뒤 수정본의 S3·S5만 임시로 되돌려 다시 실행해 올바른 이유(옛 대상이 이미 지워져 남은 항목 0개)로 실패함을 확인하고 복원했다.
- S2 `td_archive::compress_skipping` 추가, `compress`는 빈 목록으로 그것을 호출, `compress_with`가 치워 둔 경로를 건너뛰게 함 — ✅ as planned
- S3 치워 둔 임시 이름을 `<원래 이름>.td-replaced-<pid>-<n>`로 — ✅ as planned (`docs/08-vfs-file-ops.md` 문장 갱신)
- S4 `is_within` 정리(`canonical(root)`와 root의 file_id를 한 번만 계산) — ✅ as planned. 새 빨강 테스트 없음(DoD 5에 이유 기록). 기존 조상·하위 테스트가 그대로 통과.
- S5 EXDEV 이동에서 `discard`를 `remove_any(src)` 성공 뒤로 — ✅ as planned

## 수정 전 빨강 증거 (S1)
- 압축: `compress_overwrite_into_own_folder_does_not_pack_displaced_zip` 수정 전 FAILED(`overwrite_safety.rs:381`의 이름 검사: 새 zip에 `.td-replaced-*`가 들어감) → 수정 후 ok.
- 이동: `move_overwrite_across_devices_keeps_old_target_when_source_removal_fails` — S5를 되돌린 상태에서 FAILED(`kept.len()` left 0, right 1: 원본 삭제가 실패했는데 옛 대상이 이미 지워짐) → 수정 후 ok.
- 이름: `displaced_name_keeps_original_name_visible` — S3를 되돌린 상태에서 FAILED(치워 둔 항목이 없음) → 수정 후 ok.

## DoD 기준값 → 실행 후
1. `cargo test -p td-ops -p td-archive` → 73 통과, 실패 0. 새 테스트 3개를 이름으로 각각 실행 → `1 passed`씩.
2. `cargo test --workspace` → 349 통과, 실패 0(직전 346에서 새 3개). `cargo clippy -p td-ops -p td-archive -- -D warnings` → 경고 없음. `cargo fmt --check` → 통과.
3. `bun run test` → 모든 워크스페이스 통과(desktop 151 파일/1236 테스트). `tsc --noEmit` → exit 0.
4. 기존 테스트 `overwrite_copy_with_collected_item_errors_restores_old_dir_target`, `copy_dir_collects_failed_children_and_keeps_going`(및 `overwrite_ancestor_of_source_is_refused_on_copy`, `copy_into_own_child_through_symlink_is_rejected`) → 각각 `1 passed`(회귀 방지용이라 수정 전에도 통과하는 것이 정상).
5. 성능 조각은 새 테스트 없음(동작 불변, syscall 횟수는 단위 테스트로 고정할 값이 아님).

## 결정과 발견
- 코드 리뷰 지적 7건 중 4건(1·2·4·7)만 고쳤다. 3·5는 근거를 확인하고 기각했고, 6은 계약을 확정한 뒤 확인하니 **빈 오류 목록으로 `failed`가 되는 경로가 큐(`queue.rs:456`)와 `FakeBackend` 어디에도 없어서** 코드 변경 없이 기각으로 바꿨다(존재하지 않는 상황용 코드를 넣지 않는다). `{cause}`의 영어 번역 혼용은 실측으로 정상임을 확인했다(안쪽 문구도 번역됨).
- 1번의 해법은 처음부터 "치워 둔 경로를 압축기의 건너뛰기 목록에 넣는 것"으로 정했다. 압축기가 대상이 이미 있으면 `Exists`로 거부해서(compress.rs) Overwrite는 기존 zip을 먼저 치워야 하기 때문이다. 대안(압축 후에 치우기)은 옛 zip이 새 zip에 들어가는 문제가 남아 기각했다.
- 7번은 원본이 쓰기 불가라 삭제가 실패하는 경우, 이제 옛 대상이 `x.txt.td-replaced-…`로 남는다(데이터 보존). 대가로 그 폴더에 임시 항목이 하나 남을 수 있다.
- **테스트 가짜의 현실성**: `NoRenameFs`가 같은 폴더 안의 `rename`까지 막고 있었다. 실제 교차 볼륨에서도 같은 폴더 안 이름 바꾸기는 된다. 가짜를 현실에 맞춰 같은 폴더 안 rename만 통과시킨다. 기존 테스트 4곳(`NoRenameFs` 사용)은 그대로 통과한다.

## 검증하지 못한 것
- 실제 교차 볼륨(EXDEV) 이동은 여전히 실행하지 못했다(가짜로 폴백 경로만 검증).
- Windows는 컴파일 검증뿐이다.
