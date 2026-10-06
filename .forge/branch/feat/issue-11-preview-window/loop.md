# LOOP — 열린 GitHub 이슈 #11(프리뷰 창 이동·크기 조절)을 구현한다 (구현 + 테스트 + 커밋·푸시·이슈 닫기)
started: 2026-10-06
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-06T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. (#11 저장) `cargo test -p td-state preview_rect` 통과 ≥ 1, `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과, `cd apps/desktop && bunx vitest run src/__tests__ -t "미리보기 창 상태 저장"` 통과 ≥ 1.
- [ ] C2. (#11 이동) `cd apps/desktop && bunx vitest run src/__tests__ -t "미리보기 창 이동"` 통과 ≥ 1. 제목 줄 끌기로 이동, 제목 줄 64px 이상 화면 안, 끝나면 `previewRect` 반영.
- [ ] C3. (#11 크기) `cd apps/desktop && bunx vitest run src/__tests__ -t "미리보기 창 크기"` 통과 ≥ 1. 네 가장자리·모서리 끌기, 최소 320×200, 화면보다 크지 않음.
- [ ] C4. (#11 기억·초기화) `cd apps/desktop && bunx vitest run src/__tests__ -t "미리보기 창 기억"` 통과 ≥ 1. 닫았다 열기·파일 넘기기에서 유지, 화면 밖 저장 값 보정, 제목 줄 더블클릭 초기화. 그리고 `grep -c "미리보기 창" docs/07-ui-spec.md` ≥ 1이면서 이동·크기 조절이 적혀 있다.
- [ ] C5. 회귀 방지: `bunx tsc --noEmit` 통과, 전체 `bunx vitest run`의 실패는 기준선 `pdf-preview` 1건뿐(기존 미리보기 키·스크롤 테스트 포함), `cargo test -p td-state -p twin-deck-desktop` 통과, `cargo clippy -p td-state -p twin-deck-desktop -- -D warnings` 통과, `cargo fmt --check` 통과.

## Check progress (updated after EVERY stop-condition run)
- C1: not-run
- C2: not-run
- C3: not-run
- C4: not-run
- C5: not-run

## Authorized replan scope
- 실패한 조건에 직접 연결된 수정 작업만 자동 생성한다.
- 사용자 결정(2026-10-06): 위치·크기는 앱을 종료해도 유지하도록 `state.json`에 저장한다. 제목 줄 더블클릭으로 기본 크기·가운데로 초기화한다. 창 하나의 값 하나(창마다 다른 값 아님). 키보드 이동·크기 조절, 미리보기 내용 레이아웃 변경은 범위 밖.
- 사전 승인된 외부 쓰기(목표 달성 시 한 번): 작업 브랜치 `feat/issue-11-preview-window`의 커밋, 그 브랜치의 일반 푸시(강제 푸시 금지), 이슈 #11에 결과 코멘트 후 닫기. 그 밖의 외부 쓰기는 모두 안전 벽이다.
- always-halt action classes (default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (위의 사전 승인 항목은 제외) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 제외: `main`에 직접 커밋·푸시, 병합, 릴리스·태그.
- 실제 앱에서 끌 때의 부드러움, 이미지·PDF·비디오가 크기에 맞춰 보이는 모양은 기계로 검증하지 않는다. 사용자가 확인 전 이슈가 닫히는 점은 사전 승인했다.

## Tasks
- preview-window-state-1of2
- preview-window-state-2of2
