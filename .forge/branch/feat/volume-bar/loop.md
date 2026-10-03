# LOOP — 드라이브 바: 마운트된 볼륨 선택·언마운트와 현재 볼륨 남은 용량 표시 (Double Commander 방식)
started: 2026-10-03
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-03T13:25:52Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `bun run typecheck` 종료 코드 0. (회귀 방지: 지금도 통과 — 사전 통과 허용)
- [ ] C2. 회귀 없음. (a) `cargo test --workspace` 종료 코드 0. (b) `cd apps/desktop && out=$(bunx vitest run 2>&1); echo "$out" | grep -E "^ FAIL" | grep -vc "pdf-preview"` → 0 이면서 `echo "$out" | grep -c "Test Files"` ≥ 1 (기존 pdf-preview 1건만 허용, vitest가 실제로 돌았다는 증거 포함). 기존 테스트의 기대값은 약하게 고치지 않는다. (사전 통과 허용: 회귀 방지)
- [ ] C3. `cd apps/desktop && bunx vitest run src/__tests__/drive-bar.test.tsx --reporter=verbose`가 종료 코드 0이고 출력에 아래 9개 테스트 이름이 각각 ✓로 나온다(`grep -c` 각각 ≥ 1):
      D1 "각 패널 위에 마운트된 볼륨 버튼이 나온다"
      D2 "현재 폴더가 속한 볼륨이 강조된다"
      D3 "볼륨 버튼을 누르면 그 패널이 그 볼륨의 루트로 이동한다"
      D4 "현재 볼륨의 남은 용량이 표시된다"
      D5 "다른 볼륨으로 가면 그 볼륨의 남은 용량으로 바뀐다"
      D6 "현재 볼륨을 언마운트하면 그 볼륨 안의 패널은 홈으로 옮겨지고 목록에서 빠진다"
      D7 "루트 볼륨에는 언마운트 버튼이 없다"
      D8 "언마운트에 실패하면 알리고 패널을 옮기지 않는다"
      D9 "용량을 알 수 없으면 남은 용량을 표시하지 않고 오류도 내지 않는다"
      (사전: 파일 없음 → 실패. 전진 확인. 이름이 고정이라 빈 테스트로 통과시킬 수 없다.)
- [ ] C4. `cargo test -p td-volumes 2>&1` 종료 코드 0이고 출력에 `disk_space_reports_total_and_free ... ok`, `disk_space_missing_path_is_error ... ok` 가 각각 1회 이상 나온다. 앞의 테스트는 임시 폴더에 실제 statvfs를 호출해 `0 < free ≤ total`을 단언한다. (사전: 테스트 없음 → 실패. 전진 확인)
- [ ] C5. `cargo fmt --all --check` 0, `cargo clippy -p td-volumes -p twin-deck-desktop -- -D warnings` 0(라이브러리/바이너리 대상. td-archive 테스트의 기존 clippy 경고는 범위 밖), `cargo test -p twin-deck-desktop up_to_date` 0(UPDATE_BINDINGS 없이 — 바인딩/기본 설정 fixture가 최신). (사전 통과 허용: 회귀 방지)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: not run yet
- C2: not run yet
- C3: not run yet
- C4: not run yet
- C5: not run yet

## Authorized replan scope
- 위 검사 C1~C5 중 실패한 것을 직접 고치는 fix-forward 작업만. 변경 범위는 `apps/desktop/**`, `crates/td-volumes/**`, `packages/**`, `apps/desktop/src-tauri/**`, `Cargo.toml`/`Cargo.lock`(libc 의존성 추가) 안으로 한정한다.
- 기존 테스트의 기대값을 약하게 고쳐서 통과시키지 않는다. 의도된 변경(예: 패널 위에 버튼이 늘어 버튼 수를 세는 기존 테스트)만 이유를 남기고 고친다.
- **테스트와 드라이브 중 실제 `diskutil unmount/eject`나 `umount`를 실행하지 않는다.** 언마운트는 가짜 언마운터/가짜 백엔드로만 검증한다.
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 푸시, main 병합은 이 드라이브의 범위 밖이다.

## Tasks
- volbar-diskspace-backend
- volbar-store-ui
