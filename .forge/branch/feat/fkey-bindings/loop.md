# LOOP — F1~F12 키 바인딩 설정(액션 선택 + 애플리케이션 실행 + 도움말 화면)
started: 2026-10-03
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-02T17:45:22Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `bun run typecheck` 종료 코드 0. (회귀 방지: 지금도 통과한다 — 사전 통과 허용)
- [ ] C2. 회귀 없음. (a) `cargo test --workspace` 종료 코드 0. (b) `cd apps/desktop && out=$(bunx vitest run 2>&1); echo "$out" | grep -E "^ FAIL" | grep -vc "pdf-preview"` → 0 이면서 `echo "$out" | grep -c "Test Files"` ≥ 1 (기존에 실패하던 pdf-preview 1건만 허용, vitest가 실제로 돌았다는 증거 포함). 기존 테스트의 기대값은 고치지 않는다. (사전 통과 허용: 회귀 방지)
- [ ] C3. `cd apps/desktop && bunx vitest run src/__tests__/fkey-bindings.test.tsx --reporter=verbose`가 종료 코드 0이고, 출력에 아래 12개 테스트 이름이 각각 ✓로 나온다(`grep -c` 각각 ≥ 1):
      T1 "fkeys.F2에 core.rename을 지정하면 F2가 이름 바꾸기를 연다"
      T2 "기본 F5를 다른 액션으로 바꾸면 복사가 실행되지 않는다"
      T3 "none으로 지정하면 기본 키가 해제된다"
      T4 "F1은 단축키 목록 화면을 열고 Esc로 닫는다"
      T5 "앱 실행 F키는 선택 항목을 인자로 넘긴다"
      T6 "선택이 없으면 커서 항목을 넘긴다"
      T7 "빈 폴더면 현재 폴더를 넘긴다"
      T8 "앱이 지정되지 않은 F키는 실행하지 않고 알린다"
      T9 "설정 화면 F키 섹션에 F1~F12와 애플리케이션 실행 메뉴가 있다"
      T10 "F키 설정을 고르면 config에 저장된다"
      T11 "keybindings.toml이 F키 설정보다 우선한다"
      T12 "설정이 비어 있으면 기존 F키 기본 바인딩이 그대로다"
      (사전: 파일 없음 → 실패. 전진 확인. 테스트 이름이 고정이라 빈 테스트로 통과시킬 수 없다.)
- [ ] C4. `cargo test -p td-launch 2>&1` 종료 코드 0이고 출력에 `launch_app_mac_bundle ... ok`, `launch_app_direct_exec ... ok`, `launch_app_spawns_with_paths ... ok` 가 각각 1회 이상 나온다. 마지막 테스트는 (unix 한정) 임시 스크립트를 실제로 실행해 인자(경로들)가 그대로 전달되는지 파일로 확인한다. (사전: 테스트 없음 → 실패. 전진 확인)
- [ ] C5. `cargo fmt --all --check` 종료 코드 0, `cargo clippy -p td-config -p td-launch -p twin-deck-desktop -- -D warnings` 종료 코드 0(라이브러리/바이너리 대상. td-archive 테스트의 기존 clippy 경고는 범위 밖이라 제외), `cargo test -p twin-deck-desktop up_to_date` 종료 코드 0(UPDATE_BINDINGS 없이 — 바인딩/기본 설정 fixture가 최신). (사전 통과 허용: 회귀 방지)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: not run yet
- C2: not run yet
- C3: not run yet
- C4: not run yet
- C5: not run yet

## Authorized replan scope
- 위 검사 C1~C5 중 실패한 것을 직접 고치는 fix-forward 작업만. 변경 범위는 `apps/desktop/**`, `crates/td-config/**`, `crates/td-launch/**`, `packages/**`, `apps/desktop/src-tauri/**` 안으로 한정한다.
- 기존 테스트의 기대값을 약하게 고쳐서 통과시키지 않는다. (기존 테스트 변경은 F키 도움말/액션 추가로 목록 길이가 달라지는 등 의도된 변경에 한정하고 이유를 남긴다.)
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 푸시, main 병합은 이 드라이브의 범위 밖이다.

## Tasks
- fkeys-config-launch
- fkeys-keymap-help
- fkeys-settings-ui
