# LOOP — twin-deck M3(P2) 일부: ZIP 아카이브, 검색/분석·가상 탭, 압축·추출·심볼릭 링크 (로컬 macOS에서 검증 가능한 범위)
started: 2026-09-30
replan-round: 0
replan-cap: 5
budget-tokens: none
budget-spent: 0 · since: 2026-09-30T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `cargo test --workspace` 종료코드 0
- [ ] C2. `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings` 종료코드 0
- [ ] C3. `bun run typecheck && bun run test && bun run build` 종료코드 0
- [ ] C4. Rust 이름 지정 테스트가 **존재하고 통과**(각 필터마다 `cargo test --workspace <필터> -- --list | grep -c ': test'` ≥ 1 이고 통과). 회귀 방지(M1/M2): `keyboard_flow_copy_move_rename_delete` `conflict_overwrite` `conflict_skip` `conflict_rename` `nfd_korean_sort` `nfd_korean_quick_select` `watch_external_change` `trash_moves_to_trash` `permanent_delete` `queue_sequential_order` `queue_pause_resume` `queue_abort` `config_merge_precedence` `config_invalid_keeps_running` `config_watch_reload` `keybinding_unbind_none` `columns_spec_parse` `volumes_list_mounts` `large_dir_100k_list` `duplicate_suffix` `file_info_fields` `glob_group_match` `state_snapshot_roundtrip` `capabilities_cover_plugins` `capabilities_cover_new_windows`. 신규(M3): `archive_path_split` `zip_read_list_and_extract` `zip_read_external_zip_cli` `tar_gz_read` `archive_nested_read` `zip_slip_rejected` `zip_write_roundtrip_unzip_t` `archive_nested_write_back` `archive_readonly_errors` `composite_copy_between_local_and_archive` `archive_edit_writes_back` `lookup_query_parse` `lookup_operator_aliases` `lookup_live_search` `lookup_cancel` `lookup_unsupported_variable_warns` `flatten_lists_files_only` `disk_usage_sizes` `disk_usage_hardlink_once` `disk_usage_cancel` `compress_extract_roundtrip_external` `symlink_create` `symlink_error_message`
- [ ] C5. UI 테스트 파일이 apps/desktop/src/__tests__/ 에 **존재하고 통과**: 기존 12개(`keyboard-scenario` `bootstrap` `queue-ui` `menus` `columns-sort` `virtual-list` `action-bar` `actions-panel` `preview` `theme` `restore-state` `keyboard-scenario-m2`) + 신규 `archive-nav.test.tsx` `lookup-ui.test.tsx` `virtual-tabs.test.tsx` `compress-symlink.test.tsx` `keyboard-scenario-m3.test.tsx`. `keyboard-scenario*.test.tsx` 세 파일에 마우스 조작 0건(`grep -cE "\.click\(|fireEvent\.(click|mouse)|userEvent\.(pointer|hover|dblClick)"`). 각 파일 `cd apps/desktop && bun run vitest run src/__tests__/<파일>` 통과.
- [ ] C6. `cargo build --workspace` 종료코드 0 이고 `apps/desktop/dist/index.html` 존재
- [ ] C7. 테스트 우회 0건: `grep -rnE "#\[ignore\]|\.skip\(|it\.todo|\bxit\(|xdescribe|describe\.skip|test\.skip" crates apps packages --include=*.rs --include=*.ts --include=*.tsx`
- [ ] C8. `docs/m3-status.md`에 ID 13개(ARC-01 ARC-02 ARC-03 ARC-04 FIND-01 FIND-02 FIND-03 FIND-04 FIND-05 FIND-06 PANE-06 OP-11 OP-12)가 `| ID | done | <존재하는 테스트 경로> | 비고 |` 행으로 있다. ARC-02 행 비고에 `rar 미지원`, 실제 OS 부작용(외부 편집기 실행 등)을 fake로만 검증한 항목은 `fake만 검증`을 명시한다. 이번 범위에서 제외한 M3 항목(터미널, Open With, CLI 인수, 썸네일, 드래그 앤 드롭, 폰트/튜토리얼, rar 등)이 문서에 "범위 밖"으로 나열되어 있다.
- [ ] C9. **외부 도구 교차 검증(자기 채점 방지)**: `command -v unzip zip tar`가 모두 성공하고, `zip_write_roundtrip_unzip_t`·`zip_read_external_zip_cli`·`compress_extract_roundtrip_external`이 소스에서 실제로 외부 프로그램을 호출한다: `grep -q '"unzip"' crates/*/tests/*.rs` 와 `grep -q '"zip"' crates/*/tests/*.rs` 와 `grep -q '"tar"' crates/*/tests/*.rs`. 우리 코드가 쓴 zip은 `unzip -t`를 통과하고, `zip` 명령이 만든 zip은 우리 코드가 읽는다.
- [ ] C10. 보안: `zip_slip_rejected`가 `../`, 절대 경로, 백슬래시 경로, 심볼릭 링크 항목을 가진 악성 zip의 추출을 거부하고 대상 폴더 밖에 아무것도 쓰지 않음을 검증한다(테스트가 tempdir 밖 sentinel 경로의 부재를 확인). 테스트는 tempdir 밖을 쓰지 않는다.
- [ ] C11. Tauri 부팅 회귀 방지: `capabilities_cover_plugins`/`capabilities_cover_new_windows` 통과, `core:default` 존재, 모든 `tauri-plugin-*` 의존성의 권한 존재, `bootstrap.test.tsx`가 `mockIPC`로 부팅 경로를 실행.
- [ ] C12. 출처: `THIRD_PARTY_NOTICES.md` 존재, `crates/vendor/` 없음/비어 있음, `grep -rIli "spacedrive" crates apps packages --include=*.rs --include=*.ts --include=*.tsx`(generated 제외) 0건. 새로 추가한 의존 crate(zip, tar, flate2, bzip2 등)의 라이선스가 THIRD_PARTY_NOTICES.md에 나열되어 있다.

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
- C12: not-run

## Authorized replan scope
- 위 체크 중 실패한 것에 직접 대응하는 fix-forward만. 범위 확장 금지.
- 범위 밖: 내장 터미널(TERM), Open With(NAV-04), CLI 인수(CLI-01), 썸네일, 드래그 앤 드롭, 폰트 설정/튜토리얼(CFG-04/11), rar/xar/cab/iso 등 ARC-02의 tar 외 형식, Spotlight(mdfind) 백엔드, M4 이상, Spacedrive 이식, 원격 push, 3-OS 실행.
- 허용: 로컬 `git commit`, 의존성 추가(zip, tar, flate2, bzip2 등 permissive 라이선스), 테스트에서 시스템 `zip`/`unzip`/`tar` 실행.
- always-halt action classes: prod data mutation/deletion · deploy/release/publish · outbound external comms · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 추가 주의(데이터 손상 방지): 아카이브를 쓰는 모든 동작은 임시 파일에 다시 만든 뒤 원자적으로 교체한다(실패 시 원본 zip이 온전해야 한다). 추출은 대상 폴더 밖으로 나가는 항목을 거부한다. 테스트는 tempdir 안에서만 쓰고, 사용자의 실제 파일·홈·휴지통을 건드리지 않는다. 압축/추출은 원본을 지우지 않는다.

## Tasks
- archive-read
- archive-write
- composite-vfs-ops
- archive-ui
- lookup-engine
- flatten-disk-usage
- virtual-tabs-ui
- compress-extract-symlink
- m3-status
