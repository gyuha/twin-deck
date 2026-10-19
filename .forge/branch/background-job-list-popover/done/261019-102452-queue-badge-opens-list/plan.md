<!-- forge-slug: queue-badge-opens-list -->
<!-- task: 201 -->
<!-- tdd: off -->
# 백그라운드 작업 뱃지를 누르면 작업 목록과 진행률을 보여 준다 (이슈 #100)

## Goal / Non-goals
- Goal: 창 오른쪽 위 작업 뱃지(`QueueIndicator`)를 클릭하면 `=` 키와 같은 작업 큐 팝업이 열린다. 팝업의 각 작업 행에 진행률 막대를 더한다.
- Non-goals: Rust·Tauri 명령 변경, 큐 키 바인딩 변경, 팝업을 다른 UI(드롭다운 등)로 바꾸기, 버전·배포.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `queue-ui.test.tsx`에 "배지 클릭" 시험이 있고, 배지를 userEvent로 눌러 "작업 큐" 대화상자와 목록 행이 보인다 (배지 클릭 코드를 되돌리면 이 시험이 실패해야 한다 — red → green).
  2. 같은 파일에 "진행률 막대" 시험이 있고 `role="progressbar"`의 `aria-valuenow`가 completed/total 비율과 맞다.
  3. `cd apps/desktop && bunx vitest run` 전체 통과, `bunx tsc --noEmit` 통과.

## Work slices
- [ ] S1. 배지를 키보드로도 닿는 `button`으로 만들어 클릭 시 `toggleQueue`를 호출한다. 기존 `role="status"` + `aria-label` 래퍼와 "(=)" 힌트는 유지해 기존 시험이 깨지지 않게 한다 — completion criterion: 배지 클릭 시험 통과, 기존 queue-ui 시험 통과
- [ ] S2. `QueuePopup` 작업 행에 진행률 막대(`role="progressbar"`, `aria-valuenow/min/max`, 접근성 이름 i18n)를 더한다. ko/en 문구 모두 — completion criterion: 진행률 막대 시험 통과 (depends: S1)
