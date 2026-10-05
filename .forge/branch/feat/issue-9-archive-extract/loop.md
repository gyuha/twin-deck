# LOOP — 열린 GitHub 이슈 #9(압축 파일 지원 개선)를 처리한다 (구현 + 테스트 + 커밋·푸시·이슈 닫기)
started: 2026-10-05
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-05T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. (#9 컨텍스트 메뉴) `cd apps/desktop && bunx vitest run src/__tests__ -t "컨텍스트 메뉴 압축 풀기"` 통과 ≥ 1, 실패 0. 압축 파일에서 활성·클릭 시 추출 작업 생성, 일반 파일에서 비활성.
- [ ] C2. (#9 미리보기 Enter) `cd apps/desktop && bunx vitest run src/__tests__ -t "압축 파일 미리보기 Enter"` 통과 ≥ 1, 실패 0. 압축 파일 미리보기의 Return이 닫고 추출, 일반 파일의 Return은 그대로.
- [ ] C3. (#9 진행 창) `cargo test -p td-queue extract_reports_file_progress` 통과 ≥ 1, 그리고 `cd apps/desktop && bunx vitest run src/__tests__ -t "압축 풀기 진행 창"` 통과 ≥ 1. 전체 파일 수와 처리 수가 맞고, 추출 중 진행 창이 뜨고 끝나면 닫힘.
- [ ] C4. 회귀 방지: `bunx tsc --noEmit` 통과, 전체 `bunx vitest run`의 실패는 기준선 `pdf-preview` 1건뿐, `cargo test -p td-queue -p td-ops -p twin-deck-desktop` 통과(`up_to_date` 포함), `cargo clippy -p td-queue -p td-ops -p twin-deck-desktop -- -D warnings` 통과.

## Check progress (updated after EVERY stop-condition run)
- C1: pass ×0 · regressed: ×0 · last-evidence: "vitest -t '컨텍스트 메뉴 압축 풀기' → 2 passed (구현 전 2 failed)"
- C2: pass ×0 · regressed: ×0 · last-evidence: "vitest -t '압축 파일 미리보기 Enter' → 2 passed (압축 Enter 테스트는 구현 전 실패)"
- C3: pass ×0 · regressed: ×0 · last-evidence: "cargo test extract_reports_file_progress → 1 passed (구현 전 실패), vitest -t '압축 풀기 진행 창' → 1 passed (구현 전 실패)"
- C4: not-run

## Authorized replan scope
- 실패한 조건에 직접 연결된 수정 작업만 자동 생성한다.
- 기본값으로 정한 해석(사용자가 "알아서"라고 함): 컨텍스트 메뉴 항목은 항상 보이되 압축 파일에서만 켜진다. 미리보기 Enter는 닫고 `core.extract`와 같이 압축 파일 옆 새 폴더로 푼다. 진행 창은 N/M개(파일 수)로 보여 준다.
- 사전 승인된 외부 쓰기(목표 달성 시 한 번): 작업 브랜치 `feat/issue-9-archive-extract`의 커밋, 그 브랜치의 일반 푸시(강제 푸시 금지), 이슈 #9에 결과 코멘트 후 닫기. 그 밖의 외부 쓰기는 모두 안전 벽이다.
- always-halt action classes (default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (위의 사전 승인 항목은 제외) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 제외: `main`에 직접 커밋·푸시, 병합, 릴리스·태그.
- 실제 화면 확인(메뉴·진행 창 모양)은 기계로 검증하지 않는다. 사용자가 확인 전 이슈가 닫히는 점은 사전 승인했다.

## Tasks
- extract-progress (sealed)
- context-menu-extract (sealed)
- preview-enter-extract (sealed)
