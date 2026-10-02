# RUN — 파일 행 우클릭 컨텍스트 메뉴
slug: context-menu

## 슬라이스 결과
- S1 컨텍스트 메뉴 상태·컴포넌트·키보드 조작(panel 스코프 재사용)과 FileTable 우클릭 연결 — ✅ 계획대로 (테스트 2건은 가정이 틀려 고침: 휴지통 확인 설정 기본값은 꺼짐, 키 힌트 테스트는 기본 키가 없는 `core.compress`로 바꿈)
- S2 전체 회귀 확인 — ✅ 계획대로

## DoD baseline → after
- DoD 1 `context-menu.test.tsx`: 파일 없음 → 12개 통과
- DoD 2 전체 `vitest run`: 314개 통과 → 326개 통과, `bun run typecheck` 오류 0, `packages/actions` 테스트 통과
- DoD 3 실제 앱 UAT: 사람 확인 필요

## 결정·차이
- 새 `ctxMenu` 상태를 만들고 기존 `panel` 스코프를 재사용했다(`core.menu.up/down/select/close`가 ctxMenu를 먼저 처리). `core.menu.right/left`와 panel 스코프 Right/Left 바인딩을 추가했다.
- 우클릭 선택(`right_click_select`)이 켜져 있으면 선택 토글 뒤에 메뉴도 연다. 꺼져 있을 때도 우클릭은 항상 메뉴를 연다(기본 브라우저 메뉴는 막음).
- 비활성 항목은 `aria-disabled`로 흐리게 표시하고 클릭해도 실행하지 않는다. 키보드 이동은 비활성 항목을 건너뛰지 않는다(Enter는 실행기가 거른다).
