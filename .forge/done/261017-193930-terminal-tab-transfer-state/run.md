# RUN — 터미널 탭도 반대편 패널로 보낼 수 있게 한다 — 상태 쪽 (이슈 #96 ①)

워크플로 없이 직접 실행했다(변경이 작다).

## 슬라이스 결과
- S1 `store.ts`의 `transferTab` — ✅ as planned. 터미널 탭을 허용하고(다른 가상 탭은 그대로 거부), 터미널은 `copying = false`로 늘 이동한다. 마지막 탭인 터미널을 보내면 `newTab(virtual.base)` 파일 탭으로 원래 패널을 채우고 `reload`한다(`removeTerminalTab`이 마지막 터미널 탭을 닫을 때와 같은 규칙). 함수 위 주석도 고쳤다.
- S2 시험 `terminal-tab-transfer.test.ts` 6개 — ✅ as planned (터미널은 `terminalFocus`로 만들어 실제 구조를 썼다).

## DoD baseline → after
1. `terminal-tab-transfer.test.ts` — 파일 없음(실패) → 6개 통과
2. 기존 탭 이동·끌기 시험 — 23 통과 → 23 통과 (수정 없이)
3. 기존 터미널 시험 — 61 통과 → 61 통과 (수정 없이)
4. `tsc --noEmit` 통과 → 통과, `bun run test` desktop 1502 → 1508 통과·실패 0 (회귀 가드)

## 계획 밖 보정·발견
- 변형 확인(빨강): 규칙을 수정 전(`tab.virtual`이면 거부)으로 되돌리면 6개 중 5개가 실패한다. 처음에는 "세션이 닫히지 않는다" 시험이 탭이 안 옮겨져도 통과하는 공허한 시험이었다(수정 전에도 통과) — "실제로 옮겨졌다"는 단언을 더해 강화했다. 남은 1개(다른 가상 탭은 여전히 거부)는 의도한 회귀 가드라 두 상태 모두 통과한다.

## 한계
- 이 plan만으로는 셸 세션은 이어지지만 **터미널 화면(스크롤 내용)은 새 패널에서 새로 그려진다**: `Pane`이 `TerminalView`를 `key={session}`으로 마운트하고 `TerminalView`가 언마운트 때 xterm 엔진을 해제하기 때문이다. 화면 유지는 다음 plan(`terminal-view-survives-pane-move`).
- 터미널 탭을 키보드로 보내는 방법은 없다(일반 탭에도 없다, 범위 밖). 끌기(`TabBar`의 `transferTab` 호출)로만 된다.
