<!-- forge-slug: view-toggle-buttons -->
<!-- task: 55 -->
<!-- tdd: off -->
# 오른쪽 아래에 Action Bar·Drive Bar 보기 토글 버튼을 추가한다

## Goal / Non-goals
- Goal: 화면 오른쪽 아래(상태 줄 오른쪽 끝)에 Action Bar와 Drive Bar 보기 토글 버튼 두 개를 두고, 클릭하면 `behavior.layout.show_action_bar`/`show_drive_bar`가 토글돼 해당 바가 사라지거나 나타난다. 바가 숨겨진 상태에서도 버튼은 보여서 다시 켤 수 있다. Windows는 메뉴 막대가 없어 켜고 끄기 어렵다는 것이 동기다.
- Non-goals: 새 단축키, 설정 화면 변경, 버튼 모양의 세부 디자인(아이콘 라이브러리 추가 등).
- 이슈 추적: GitHub 이슈 #2

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "보기 토글"` → 통과 1개 이상, 실패 0. pre-state 0 tests, 전진 검사. 테스트는 버튼 클릭으로 Action Bar/Drive Bar가 DOM에서 사라졌다 다시 나타나는지, 숨긴 뒤에도 버튼이 남아 있는지를 단언한다.
  2. `cd apps/desktop && bunx tsc --noEmit` 통과 (회귀 방지, 작업 전에도 통과).
  3. 전체 `bunx vitest run`의 실패는 기준선인 `pdf-preview` 1건뿐이다 (회귀 방지, 작업 전에도 동일).

## Work slices
- [ ] S1. `StatusBar`(또는 그 옆) 오른쪽 끝에 토글 버튼 두 개를 추가하고 `api.toggleLayoutFlag`에 연결한다. 접근 가능한 이름과 현재 켜짐 상태(`aria-pressed`)를 둔다 — completion criterion: DoD 1
