# LOOP — 열린 GitHub 이슈 #4~#7을 처리한다 (구현 + 테스트 + 커밋·푸시·이슈 닫기)
started: 2026-10-05
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-05T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. (#4) `cd apps/desktop && bunx vitest run src/__tests__ -t "빠른 선택 이동"`과 `-t "빠른 선택 실행"` 각각 통과 ≥ 1, 실패 0. 일치하지 않는 행을 건너뛰고 일치 행 사이만 이동·끝에서 멈춤, Return은 빠른 선택을 끝내고 커서 행을 연다.
- [ ] C2. (#5) `cargo test -p twin-deck-desktop preview_archive` 통과 ≥ 1, 그리고 `cd apps/desktop && bunx vitest run src/__tests__ -t "압축 파일 미리보기"` 통과 ≥ 1. 중첩 폴더가 들여쓰기된 텍스트 트리, 항목 수 한도, 깨진 압축은 `other`.
- [ ] C3. (#6) `cd apps/desktop && bunx vitest run src/__tests__ -t "보기 단축키"` 통과 ≥ 1. 키 입력 토글, Help 표시, 상태 줄 버튼 표시, 메뉴 항목 글자(accelerator 없음), 그리고 `grep -n "Shift+A" docs/05-actions-keybindings.md` ≥ 1 및 `Shift+D` ≥ 1.
- [ ] C4. (#7) `cd apps/desktop && bunx vitest run src/__tests__ -t "다중 이름 바꾸기 단축키"` 통과 ≥ 1. Help와 File 메뉴 항목에 `Shift+R` 표기, `Mod+Shift+F`는 여전히 빠른 선택 시작.
- [ ] C5. 회귀 방지: `bunx tsc --noEmit` 통과, 전체 `bunx vitest run`의 실패는 기준선 `pdf-preview` 1건뿐, `cargo test -p twin-deck-desktop` 통과(`up_to_date` 포함), `cargo clippy -p twin-deck-desktop -- -D warnings` 통과.

## Check progress (updated after EVERY stop-condition run)
- C1: not-run
- C2: not-run
- C3: not-run
- C4: not-run
- C5: not-run

## Authorized replan scope
- 실패한 조건에 직접 연결된 수정 작업만 자동 생성한다.
- 사용자 결정(2026-10-05): #7은 다중 이름 바꾸기 `Mod+Shift+R`을 유지하고 `Mod+Shift+F`(빠른 선택 시작)는 바꾸지 않는다. #6의 "상단 바"는 macOS 메뉴 막대의 View 메뉴다. 네이티브 accelerator는 달지 않고 글자로만 표시한다.
- 사전 승인된 외부 쓰기(목표 달성 시 한 번): 작업 브랜치 `feat/issues-4-7`의 커밋, 그 브랜치의 일반 푸시(강제 푸시 금지), 이슈 #4~#7에 결과 코멘트 후 닫기. 그 밖의 외부 쓰기는 모두 안전 벽이다.
- always-halt action classes (default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (위의 사전 승인 항목은 제외) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 제외: `main`에 직접 커밋·푸시, 병합, 릴리스·태그.
- 실제 화면 확인(메뉴 막대 표시, 트리 모양 등)은 기계로 검증하지 않는다. 사용자가 확인 전 이슈가 닫히는 점은 사전 승인했다.

## Tasks
- quick-select-nav
- archive-preview-tree
- layout-toggle-shortcuts
- multi-rename-key-display
