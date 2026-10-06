<!-- forge-slug: folder-size-on-select-2of2 -->
<!-- task: 66 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 선택한 폴더 용량 계산 (2/2): 크기 표시, 상태 줄 합산, 설정 스위치

## Goal / Non-goals
- Goal: 폴더를 *선택*(`Space`/`Insert`, `Ctrl+A`, 클릭 선택)하면 그 폴더의 하위 용량을 백그라운드로 계산해, 크기 칸에 계산 중에는 `…`, 끝나면 `8.5 MB`를 보여 주고 상태 줄의 선택 용량과 전체 용량에 더한다(계산하지 않은 폴더는 지금처럼 비고 더하지 않는다). 계산은 한 번에 하나씩 순서대로 한다. 선택을 풀거나 폴더를 벗어나면 진행 중·대기 중 계산을 취소한다. 한 번 끝난 크기는 선택을 풀어도 목록이 다시 읽히기 전까지 남고, 새로 읽기·파일 변경 감지·폴더 이동에서 지운다. 설정 화면 "표시 형식" 탭에 `선택한 폴더 용량 계산` 스위치(`display.folder_size_on_select`, 기본 켜짐)를 넣고, 끄면 계산하지 않는다. 압축 파일 안과 가상 탭에서는 계산하지 않는다.
- Non-goals: 커서만 올렸을 때의 계산, 폴더 용량 열 정렬 변경, 바이트 진행률, 새 단축키.
- 선행: 1/2(백엔드 `dir_size` 명령과 설정 키)가 먼저 봉인돼 있어야 한다.
- 이슈 추적: 없음(사용자 직접 요청)

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "선택 폴더 용량"` → 통과 ≥ 1, 실패 0. 선택하면 `…` 뒤에 크기가 크기 칸과 상태 줄(선택/전체)에 나오는지, 계산하지 않은 폴더는 비어 있는지, `Ctrl+A`가 순서대로 하나씩 계산하는지, 선택을 풀면 대기 중 계산이 취소되고 끝난 크기는 남는지, 목록을 다시 읽으면 캐시가 지워지는지, 옵션을 끄면 계산하지 않는지, 가상 탭·압축 안에서는 계산하지 않는지를 단언한다. 작성 시점 pre-state: 0 tests(`648 skipped`가 초록으로 보이니 "passed ≥ 1"까지 확인). 전진 검사.
  2. `cd apps/desktop && bunx vitest run src/__tests__ -t "폴더 용량 설정"` → 통과 ≥ 1: 설정 화면 "표시 형식" 탭에 스위치가 있고 토글하면 `display.folder_size_on_select`가 저장된다. 전진 검사. 기존 설정 탭 목록 테스트(탭 이름)는 그대로 통과한다(회귀 방지).
  3. `grep -c "folder_size_on_select" docs/06-config-plugins.md` ≥ 1, `grep -c "폴더 용량" docs/07-ui-spec.md` ≥ 1. pre-state 0, 전진 검사.
  4. `bunx tsc --noEmit`, 전체 `bunx vitest run`(실패는 기준선 `pdf-preview` 1건뿐)이 통과한다. 회귀 방지 검사로 작업 전에도 같다. 기존 상태 줄 요약 테스트(`선택 요약`)도 그대로 통과한다.

## Work slices
- [ ] S1. 스토어에 폴더 경로별 크기 상태(계산 중/완료)와 순차 큐를 둔다: 선택 변경 시 새로 선택된 폴더를 큐에 넣고 풀린 폴더는 취소, 목록 재읽기·폴더 이동에서 캐시 초기화, 옵션이 꺼져 있거나 가상 탭·압축 경로면 건너뜀 — completion criterion: DoD 1(계산·취소·캐시 부분)
- [ ] S2. 크기 칸과 상태 줄(`selectionSummary`)이 계산된 폴더 크기를 쓴다 — completion criterion: DoD 1(표시 부분) (depends: S1)
- [ ] S3. 설정 화면 "표시 형식" 탭에 스위치를 더하고 `docs/06`·`docs/07`을 고친다 — completion criterion: DoD 2, 3 (depends: S1)
