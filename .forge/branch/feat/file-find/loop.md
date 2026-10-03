# LOOP — Cmd/Ctrl+F 파일 찾기 다이얼로그(기본 탭): 하위 폴더 검색, 마스크·제외·깊이·정규식, 파일 안 텍스트 찾기
started: 2026-10-03
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-03T13:57:01Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `bun run typecheck` 종료 코드 0. (회귀 방지: 지금도 통과 — 사전 통과 허용)
- [ ] C2. 회귀 없음. (a) `cargo test --workspace` 종료 코드 0. (b) `cd apps/desktop && out=$(bunx vitest run 2>&1); echo "$out" | grep -E "^ FAIL" | grep -vc "pdf-preview"` → 0 이면서 `echo "$out" | grep -c "Test Files"` ≥ 1 (기존 pdf-preview 1건만 허용, vitest가 실제로 돌았다는 증거 포함). 기존 테스트의 기대값은 약하게 고치지 않는다. 단, Quick Select 키가 Mod+F → Mod+Shift+F로 바뀌는 의도된 변경에 따라 `config.test.tsx`(160행)·`navigation.test.tsx`의 그 키 입력은 새 키로 고친다(이유를 `run.md`에 남긴다). (사전 통과 허용: 회귀 방지)
- [ ] C3. `cd apps/desktop && bunx vitest run src/__tests__/file-find.test.tsx --reporter=verbose`가 종료 코드 0이고 출력에 아래 15개 테스트 이름이 각각 ✓로 나온다(`grep -c` 각각 ≥ 1):
      F1 "Mod+F가 파일 찾기 다이얼로그를 열고 Esc로 닫는다"
      F2 "Quick Select는 Mod+Shift+F로 시작한다"
      F3 "다이얼로그에 기본 탭의 디렉터리·파일·데이터 찾기 영역과 버튼이 있다"
      F4 "시작 디렉터리의 기본값은 현재 폴더다"
      F5 "시작하면 하위 폴더까지 마스크에 맞는 파일을 새 탭에 보여 준다"
      F6 "하위 디렉터리에서 검색을 현재 디렉터리만으로 하면 하위 폴더는 찾지 않는다"
      F7 "하위 디렉터리 제외와 파일 제외 마스크가 적용된다"
      F8 "파일 이름의 일부로 검색을 끄면 이름이 정확히 같은 파일만 찾는다"
      F9 "정규식을 켜면 파일 마스크를 정규식으로 해석한다"
      F10 "파일에서 텍스트 찾기는 내용에 글자가 든 파일만 보여 준다"
      F11 "텍스트를 포함하지 않는 파일 찾기는 반대로 보여 준다"
      F12 "선택한 디렉터리 및 파일에 체크하면 선택한 항목 안에서만 찾는다"
      F13 "열려있는 탭에 체크하면 열려 있는 모든 탭의 폴더에서 찾는다"
      F14 "새 검색은 입력을 비우고 마지막 검색은 직전 조건을 되살린다"
      F15 "아직 지원하지 않는 항목은 비활성이고 찾는 중에 다시 열면 취소할 수 있다"
      (사전: 파일 없음 → 실패. 전진 확인. 이름이 고정이라 빈 테스트로 통과시킬 수 없다.)
- [ ] C4. `cargo test -p td-search 2>&1` 종료 코드 0이고 출력에 아래 8개가 각각 `... ok`로 1회 이상 나온다: `find_matches_masks_recursively` · `find_respects_max_depth` · `find_excludes_dirs_and_files` · `find_substring_vs_exact_name` · `find_regex_name` · `find_text_in_files` · `find_text_inverted` · `find_follow_symlinks_without_looping`. 그리고 `cargo test -p twin-deck-desktop start_find 2>&1`에 `start_find_streams_matches ... ok`. 모두 임시 폴더의 실제 파일시스템으로 검증한다. (사전: 테스트 없음 → 실패. 전진 확인)
- [ ] C5. `cargo fmt --all --check` 0, `cargo clippy -p td-search -p twin-deck-desktop -- -D warnings` 0(라이브러리/바이너리 대상. td-archive 테스트의 기존 clippy 경고는 범위 밖), `cargo test -p twin-deck-desktop up_to_date` 0(UPDATE_BINDINGS 없이 — 바인딩 fixture가 최신). (사전 통과 허용: 회귀 방지)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: not run yet
- C2: not run yet
- C3: not run yet
- C4: not run yet
- C5: not run yet

## Authorized replan scope
- 위 검사 C1~C5 중 실패한 것을 직접 고치는 fix-forward 작업만. 변경 범위는 `apps/desktop/**`, `crates/td-search/**`, `crates/td-vfs/**`(glob 재사용), `packages/**`, `apps/desktop/src-tauri/**`, `Cargo.toml`/`Cargo.lock`(`regex` 의존성 추가), `docs/05-actions-keybindings.md` 안으로 한정한다.
- 기존 테스트의 기대값을 약하게 고쳐서 통과시키지 않는다. 의도된 변경(Quick Select 키 이동)만 이유를 남기고 고친다.
- **파일 내용을 수정하는 기능(바꾸기)은 만들지 않는다.** 검색은 읽기 전용이다. 테스트는 임시 폴더(`tempfile`)만 읽고 쓴다.
- always-halt action classes (safety wall — default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 푸시, main 병합은 이 드라이브의 범위 밖이다.

## Tasks
- find-engine-backend
- find-dialog-ui
