# run — 오른쪽 아래에 Action Bar·Drive Bar 보기 토글 버튼 추가

워크플로우 없이 직접 실행했다. 테스트를 먼저 써서 빨간 상태를 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 `StatusBar` 오른쪽 끝에 토글 버튼 둘(Drive Bar, Action Bar)을 추가하고 `api.toggleLayoutFlag`에 연결, `aria-pressed`로 켜짐 상태 표시 — ✅ 계획대로

## 계획과 달라진 점
- 없음. 새 설정 키·타입·명령을 만들지 않았다(기존 `toggleLayoutFlag`와 `behavior.layout.*`를 그대로 사용). 그래서 `task gen-types`와 `up_to_date` 테스트는 해당 없음.
- 버튼은 상태 줄(`footer`) 안에 두었다. 바가 숨겨져도 상태 줄은 항상 남아서 다시 켤 수 있다.
- 꺼진 상태는 흐린 색과 취소선으로 표시했다(모양은 사람이 실제 화면에서 확인해야 한다).

## DoD baseline → after
1. `vitest -t "보기 토글"` — 0 tests → 2 passed (전진 검사 충족. 구현 전 2개 모두 실패 확인)
2. `bunx tsc --noEmit` — 통과 → 통과 (회귀 방지)
3. 전체 vitest — 실패 `pdf-preview` 1건 → 같음 (회귀 방지). 612 통과

## 남은 불확실성
- 버튼의 실제 위치·모양·클릭 영역(특히 Windows)은 테스트가 DOM 존재와 동작까지만 확인했다. 실제 화면 확인은 사람 몫이다.
