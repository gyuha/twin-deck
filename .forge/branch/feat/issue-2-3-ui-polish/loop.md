# LOOP — 열린 GitHub 이슈 #2, #3을 처리한다 (코드 구현 + 테스트 + 커밋·푸시·이슈 닫기)
started: 2026-10-05
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-05T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. (#3) `cd apps/desktop && bunx vitest run src/__tests__ -t "새로 만든 폴더"` → 통과 ≥ 1, 실패 0. 테스트는 새 폴더가 맨 아래에 정렬되는 이름과 긴 목록에서 커서 행의 이름이 새 폴더임을 단언한다.
- [ ] C2. (#2) `cd apps/desktop && bunx vitest run src/__tests__ -t "보기 토글"` → 통과 ≥ 1, 실패 0. 테스트는 버튼 클릭으로 Action Bar/Drive Bar가 사라졌다 나타나는지, 숨긴 뒤에도 버튼이 남는지를 단언한다.
- [ ] C3. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0, 그리고 전체 `bunx vitest run`의 실패는 기준선 `pdf-preview` 1건뿐.
- [ ] C4. 설정·타입·명령 시그니처를 바꿨다면 `cargo test -p twin-deck-desktop up_to_date`가 통과한다(안 바꿨다면 통과 상태 유지).

## Check progress (updated after EVERY stop-condition run)
- C1: not-run
- C2: not-run
- C3: not-run
- C4: not-run

## Authorized replan scope
- 실패한 조건에 직접 연결된 수정 작업만 자동 생성한다.
- 사전 승인된 외부 쓰기(목표 달성 시 한 번): 작업 브랜치 `feat/issue-2-3-ui-polish`의 커밋, 그 브랜치의 일반 푸시(강제 푸시 금지), 이슈 #2·#3에 결과 코멘트 후 닫기. 그 밖의 외부 쓰기는 모두 안전 벽이다.
- always-halt action classes (default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs; 위의 사전 승인 항목은 제외) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 제외: `main`에 직접 커밋·푸시, 병합, 릴리스·태그, 이슈 #1과 무관한 이슈 편집.
- 실제 화면 확인(위치·모양, 특히 Windows)은 기계로 검증하지 않는다. 이슈를 닫기 전에 사용자가 확인하지 않은 채 닫히는 점은 사용자가 사전 승인했다.

## Tasks
- new-folder-focus
- view-toggle-buttons
