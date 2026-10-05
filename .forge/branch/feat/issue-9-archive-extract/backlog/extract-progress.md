<!-- forge-slug: extract-progress -->
<!-- task: 60 -->
<!-- tdd: off -->
# 압축을 푸는 동안 진행 창을 띄워 N/M개로 진행을 보여 준다

## Goal / Non-goals
- Goal: `extract`(압축 풀기)가 큐에 올린 추출 작업의 진행 창이 뜨고, 아카이브 안 전체 파일 수(`filesTotal`)와 처리한 수(`filesDone`)를 "N/M개"로 보여 준다. 끝나면 창이 닫히고 목록이 갱신된다. 오류가 있으면 닫지 않고 오류를 보여 준다(기존 전송 진행 창과 같은 동작).
- Non-goals: 바이트 진행률, 압축(compress) 쪽 변경, 새 설정 키, 아카이브 안의 아카이브 처리.
- 이슈 추적: GitHub 이슈 #9

## Source of truth
- Glossary terms: 전송 진행 창 (.forge/CONTEXT.md)
- Related ADRs: none
- Definition of Done:
  1. `cargo test -p td-queue extract_reports_file_progress` → 통과 ≥ 1, 실패 0. 파일 3개가 든 zip을 추출하면 `files_total == Some(3)`, 끝났을 때 `files_done == 3`인지 단언한다(폴더 항목은 세지 않는다). 전진 검사(작성 시점 0 tests).
  2. `cd apps/desktop && bunx vitest run src/__tests__ -t "압축 풀기 진행 창"` → 통과 ≥ 1, 실패 0. 추출 중 "압축 풀기 중" 창과 "N/M개"가 보이고 끝나면 닫히는지 단언한다. 전진 검사.
  3. `cargo test -p twin-deck-desktop up_to_date`, `cargo clippy -p td-queue -p td-ops -p twin-deck-desktop -- -D warnings`, `bunx tsc --noEmit` 통과(회귀 방지).

## Work slices
- [ ] S1. 큐가 추출 작업의 `files_total`을 아카이브 항목 수로 채우고 파일마다 `files_done`을 올린다 — completion criterion: DoD 1
- [ ] S2. `store.ts`의 `extract`가 작업마다 `trackTransfer(jobId, "압축 풀기")`로 진행 창을 띄운다(`FakeBackend`도 추출 작업의 `filesTotal`을 채운다) — completion criterion: DoD 2 (depends: S1)
