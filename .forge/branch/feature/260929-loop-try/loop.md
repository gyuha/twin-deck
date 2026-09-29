# LOOP — twin-deck M0(스캐폴딩) + M1(MVP, P0) 구현 (docs/11-roadmap.md 기준, 로컬 macOS에서 검증 가능한 범위)
started: 2026-09-29
replan-round: 0
replan-cap: 5
budget-tokens: none
budget-spent: 0 · since: 2026-09-29T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. Rust 전체 테스트: `cargo test --workspace` 종료코드 0 (`--no-run`/필터 없이, 실제 실행)
- [ ] C2. Rust 품질: `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings` 종료코드 0
- [ ] C3. TS 전체: `bun run typecheck && bun run test && bun run build` 종료코드 0 (vitest 실행 + vite 빌드)
- [ ] C4. 실제 디스크 동작(임시 디렉터리) 이름 지정 테스트가 **존재하고 통과**: 각 필터에 대해 `cargo test --workspace <필터> -- --list | grep -c ': test'` ≥ 1 이면서 `cargo test --workspace <필터>` 통과 — 필터: `keyboard_flow_copy_move_rename_delete`(복사→이동→이름변경→삭제 시나리오), `conflict_overwrite`, `conflict_skip`, `conflict_rename`, `nfd_korean_sort`, `nfd_korean_quick_select`, `watch_external_change`(다른 프로세스/스레드에서 파일 변경 시 이벤트 수신), `trash_moves_to_trash`, `permanent_delete`
- [ ] C5. 키보드 전용 UI 시나리오: `apps/desktop/src/__tests__/keyboard-scenario.test.tsx`가 존재하고 통과하며, 그 파일에 마우스 조작이 없다: `grep -cE "\.click\(|fireEvent\.(click|mouse)|userEvent\.(pointer|hover|dblClick)" <그 파일>` = 0. 시나리오 = 폴더 이동 → 파일 선택 → 비활성 패널로 복사/이동 → 이름 변경 → 삭제 (Tab, 방향키, Enter, Space/선택키, F5/F6/Shift+F6/F8 액션 경유)
- [ ] C6. 앱 전체 빌드: `cargo build --workspace` 종료코드 0 (Tauri 데스크톱 크레이트 포함) 이고 `bun run build`가 `apps/desktop/dist/index.html`을 생성
- [ ] C7. 테스트 우회 금지: `grep -rnE "#\[ignore\]|\.skip\(|it\.todo|xit\(|xdescribe|describe\.skip|test\.skip" crates apps packages --include=*.rs --include=*.ts --include=*.tsx` 결과 0건
- [ ] C8. M1 P0 상태 문서 `docs/m1-status.md`: ID PANE-01 PANE-02 PANE-04 NAV-01 NAV-03 NAV-12 SEL-01 SEL-02 SEL-05 OP-01 OP-02 OP-03 OP-04 OP-05 OP-06 OP-07 OP-17 ACT-02 **18개 전부** 각각 표 행으로 존재(`grep -c` 각 ≥ 1). 각 행은 `done`(검증 테스트 파일 경로 포함, 그 경로가 실제 존재) 또는 `not-done`(사유 포함). `done` 행의 테스트 경로가 존재하지 않으면 실패. (`not-done`이 있으면 목표 미달로 간주하는 것이 기본 — 사용자가 사유를 승인하기 전에는 fork 벽)
- [ ] C9. 출처/이식: `THIRD_PARTY_NOTICES.md`와 `justfile`, `rust-toolchain.toml`, `.nvmrc`, `Cargo.toml`(workspace), `package.json`(workspaces)이 존재하고, 자체 구현 결정에 따라 `crates/vendor/`가 없거나 비어 있으며 소스에 Spacedrive 코드 복사 흔적이 없다: `grep -rIli "spacedrive" crates apps packages --include=*.rs --include=*.ts --include=*.tsx` 0건 (THIRD_PARTY_NOTICES.md/docs 제외)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: not-run
- C2: not-run
- C3: not-run
- C4: not-run
- C5: not-run
- C6: not-run
- C7: not-run
- C8: not-run
- C9: not-run

## Authorized replan scope
- 위 체크 중 실패한 것에 직접 대응하는 fix-forward 태스크만. 기능 추가·M2 이상 항목 금지.
- 범위 외 명시: M2~M5 항목(큐 UI, Volumes, TOML 로더, 다중 컬럼, 미리보기, 아카이브, 터미널, 플러그인, CI 파이프라인 실행, 패키징/서명), Spacedrive 코드 이식(자체 구현 결정), 원격 push.
- 허용: 로컬 `git commit`(feature 브랜치, 태스크별 롤백 포인트), 의존성 설치(`bun install`, cargo fetch).
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 추가 주의: 테스트는 반드시 tempdir 안에서만 파괴적 작업 수행. 사용자 홈 등 실제 디렉터리에 대한 삭제/휴지통 테스트 금지.

## Tasks
- m0-scaffold
- td-vfs-local
- td-ops-file-ops
- td-watch-events
- actions-keymap
- tauri-bridge
- ui-panes-navigation
- ui-file-ops-scenario
