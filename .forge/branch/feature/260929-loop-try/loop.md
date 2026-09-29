# LOOP — twin-deck M2(패리티 핵심, P1) 구현 (docs/11-roadmap.md 기준, 로컬 macOS에서 검증 가능한 범위)
started: 2026-09-29
replan-round: 0
replan-cap: 5
budget-tokens: none
budget-spent: 0 · since: 2026-09-29T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `cargo test --workspace` 종료코드 0
- [ ] C2. `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings` 종료코드 0
- [ ] C3. `bun run typecheck && bun run test && bun run build` 종료코드 0
- [ ] C4. Rust 이름 지정 테스트가 **존재하고 통과**(각 필터마다 `cargo test --workspace <필터> -- --list | grep -c ': test'` ≥ 1 이고 통과): M1 유지분 `keyboard_flow_copy_move_rename_delete` `conflict_overwrite` `conflict_skip` `conflict_rename` `nfd_korean_sort` `nfd_korean_quick_select` `watch_external_change` `trash_moves_to_trash` `permanent_delete` + M2 신규 `queue_sequential_order` `queue_pause_resume` `queue_abort` `config_merge_precedence` `config_invalid_keeps_running` `config_watch_reload` `keybinding_unbind_none` `columns_spec_parse` `volumes_list_mounts` `large_dir_100k_list` `duplicate_suffix` `file_info_fields` `glob_group_match` `state_snapshot_roundtrip`
- [ ] C5. UI 테스트 파일이 apps/desktop/src/__tests__/ 에 **존재하고 통과**: `keyboard-scenario.test.tsx`(M1) `bootstrap.test.tsx` `queue-ui.test.tsx` `menus.test.tsx` `columns-sort.test.tsx` `virtual-list.test.tsx` `action-bar.test.tsx` `actions-panel.test.tsx` `preview.test.tsx` `theme.test.tsx` `restore-state.test.tsx` `keyboard-scenario-m2.test.tsx`. `keyboard-scenario*.test.tsx` 두 파일에는 마우스 조작이 없다: `grep -cE "\.click\(|fireEvent\.(click|mouse)|userEvent\.(pointer|hover|dblClick)"` = 0. 각 파일 실행: `cd apps/desktop && bun run vitest run src/__tests__/<파일>` 통과.
- [ ] C6. `cargo build --workspace` 종료코드 0 이고 `apps/desktop/dist/index.html` 존재
- [ ] C7. 테스트 우회 0건(패턴 정정 2026-09-29: `xit\(`가 `app.exit(0)`의 `exit(`에 걸리는 오탐이라 단어 경계 `\bxit\(`로 바로잡음 — 실제 xit 건너뛰기는 여전히 잡는다): `grep -rnE "#\[ignore\]|\.skip\(|it\.todo|\bxit\(|xdescribe|describe\.skip|test\.skip" crates apps packages --include=*.rs --include=*.ts --include=*.tsx`
- [ ] C8. `docs/m2-status.md`에 P1 ID 32개(PANE-03 PANE-05 PANE-07 NAV-02 NAV-05 NAV-06 NAV-07 NAV-08 NAV-09 NAV-10 NAV-11 SEL-03 SEL-04 OP-08 OP-09 OP-10 OP-13 OP-14 OP-15 OP-16 Q-01 Q-02 Q-03 VIEW-01 CFG-02 CFG-03 CFG-05 CFG-06 CFG-07 CFG-08 ACT-01 ACT-03)가 표 행 `| ID | done | <존재하는 테스트 경로> | 비고 |`로 있다(`not-done`이면 미달). OS 부작용을 fake로만 검증한 항목(언마운트, 파일 관리자에서 보기, 외부 편집기, 클립보드, 멀티 윈도우)은 비고에 `fake만 검증`을 명시한다.
- [ ] C9. `docs/m2-benchmark.md`에 macOS에서 실제 측정한 값이 있다: 10만 항목 디렉터리의 목록 조회/정렬 시간(ms)과 UI가 그리는 DOM 행 수, 측정 환경, 그리고 가설 임계값 대비 판정 문장. `grep -E "[0-9]+ ?ms"` ≥ 2, `large_dir_100k_list` 테스트가 같은 규모(100_000)를 실제로 생성해 조회한다.
- [ ] C10. Tauri 부팅 회귀 방지: `apps/desktop/src-tauri/capabilities/*.json`에 `core:default`가 있고, `apps/desktop/src-tauri/Cargo.toml`의 모든 `tauri-plugin-*` 의존성에 대응하는 `<플러그인>:default`(또는 더 구체적인) 권한이 capability에 있다. 이를 검증하는 Rust 테스트 `capabilities_cover_plugins`가 존재하고 통과한다. `bootstrap.test.tsx`는 Tauri IPC를 모킹(`@tauri-apps/api/mocks`)한 채 실제 `main`의 시작 경로를 실행해 두 패널이 렌더되고, IPC가 거부될 때는 빈 화면 대신 오류 문구가 렌더됨을 검증한다.
- [ ] C11. 출처: `THIRD_PARTY_NOTICES.md` 존재, `crates/vendor/`가 없거나 비어 있고 `grep -rIli "spacedrive" crates apps packages --include=*.rs --include=*.ts --include=*.tsx`(generated 제외) 0건

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
- C10: not-run
- C11: not-run

## Authorized replan scope
- 위 체크 중 실패한 것에 직접 대응하는 fix-forward 태스크만. M3 이상 기능 추가 금지.
- 범위 외: M3~M5(아카이브, Look Up, 터미널, 플러그인/Gadgets, 패키징/서명, 3-OS CI 실행), Spacedrive 코드 이식, 원격 push, 5종 내장 테마 재현(P3, 라이트/다크만).
- 허용: 로컬 `git commit`(feature 브랜치), 의존성 설치(bun/cargo), Tauri 공식 플러그인 추가(capability 동반).
- always-halt action classes: prod data mutation/deletion · deploy/release/publish · outbound external comms · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 추가 주의: 테스트는 tempdir 안에서만 파괴적 작업을 한다. 언마운트/추출, 파일 관리자 열기, 외부 편집기 실행, 클립보드, OS 휴지통은 trait fake로만 검증하고 실제 시스템을 건드리는 테스트를 만들지 않는다. 10만 파일 벤치마크는 tempdir에서만 생성하고 삭제한다.

## Tasks
- m2-bootstrap-guard
- td-queue
- queue-ui
- td-config
- volumes-and-nav-menus
- columns-sort-virtual-list
- selection-and-file-actions
- action-bar-and-panel
- preview-and-theme
- state-restore-and-windows
- m2-benchmark-status
