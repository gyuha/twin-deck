<!-- forge-slug: terminal-tab-transfer-state -->
<!-- task: 198 -->
<!-- priority: high -->
<!-- tdd: off -->
# 터미널 탭도 반대편 패널로 보낼 수 있게 한다 — 상태 쪽 (이슈 #96 ①)

## Goal / Non-goals
- Goal: `store.ts`의 `transferTab`(탭을 끌어 반대편 패널로 보내기)이 **터미널 탭도 옮긴다.** 지금은 `if (!tab || tab.virtual) return`이라 터미널 탭(`virtual.kind === "terminal"`)이 가상 탭으로 일괄 제외돼 아무 일도 없다. 터미널 탭은 **복사하지 않고 항상 이동**한다(pty 세션이 하나뿐). 옮겨진 탭은 같은 탭 id·같은 `virtual.jobId`(세션 번호)를 유지하고, 세션을 닫지 않으며, 대상 패널에서 활성 탭이 되고 그 패널이 활성 패널이 된다. 터미널이 그 패널의 **마지막 탭이면** 옮기고 원래 패널에는 그 터미널이 시작한 폴더(`virtual.base`)를 보는 새 파일 탭을 채운다(패널이 비지 않게; 터미널 탭을 닫을 때 `removeTerminalTab`이 하는 것과 같은 규칙). 원격 폴더에서 시작한 터미널(`base`가 `sftp://…`)도 같다.
- Non-goals: 터미널 **화면**(스크롤 내용)을 옮기는 일 — 그것은 plan `terminal-view-survives-pane-move`다(이 plan만 먼저 봉인되면 셸은 살아 있지만 화면은 새로 그려진다). 검색 결과·Look Up·Flatten·Disk Usage 같은 **다른 가상 탭**의 전송(그대로 거부). 일반 탭의 이동·복사 규칙 변경. 탭을 키보드로 반대편에 보내는 새 액션(일반 탭에도 없다). 같은 패널 안 순서 바꾸기(`moveTab`)는 이미 모든 탭에 된다. Rust·`Backend` 인터페이스·생성 바인딩·의존성 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none (`docs/07-ui-spec.md`의 탭 끌기, `store.ts`의 `transferTab`·`removeTerminalTab`)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/terminal-tab-transfer.test.ts` 종료 코드 0, 테스트 6개 이상 통과 (파일이 없는 지금은 실패 — 앞으로 가야 할 검사). 시험은 최소 이 여섯을 단언한다: (a) 터미널 탭이 원래 패널의 둘 이상의 탭 중 하나일 때 `transferTab`이 이동한다 — 원래 패널에서 빠지고, 대상 패널의 `toIndex`에 들어가고, **탭 id와 `virtual.jobId`가 그대로**이며, 대상 패널의 활성 탭이 되고 `activePane`이 대상 패널이 된다 (b) 이동해도 세션이 닫히지 않는다(`FakeBackend`의 터미널 세션이 그대로 있고 `terminalClose`가 불리지 않는다) (c) 터미널이 원래 패널의 **유일한 탭**이면 이동하고, 원래 패널에는 정확히 탭 1개 — 가상이 아닌 파일 탭, 경로가 그 터미널의 `virtual.base` — 가 생기고 목록이 읽혀(`entries`) 있다 (d) 원격 폴더에서 시작한 터미널(`base`가 `sftp://…`)도 (a)와 같이 이동한다 (e) `toIndex`가 범위를 벗어나면 끝으로 보정되어 들어간다 (f) 검색 결과 같은 **다른 가상 탭**은 여전히 옮겨지지 않는다(두 패널의 탭 목록이 그대로).
  2. 기존 탭 이동·끌기 시험이 수정 없이 통과한다: `cd apps/desktop && bunx vitest run src/__tests__/tab-transfer-store.test.ts src/__tests__/tab-drag-cross-pane.test.tsx src/__tests__/tab-drag-edges.test.tsx src/__tests__/tab-drag-reorder.test.tsx` 종료 코드 0, 23개 통과 (회귀 가드: 지금 23 통과 — 일반 탭은 둘 이상이면 이동·하나뿐이면 복사가 그대로다).
  3. 기존 터미널 시험이 수정 없이 통과한다: `cd apps/desktop && bunx vitest run src/__tests__/terminal-pane.test.tsx src/__tests__/terminal-engine.test.ts src/__tests__/remote-terminal.test.tsx src/__tests__/remote-terminal-connect.test.tsx src/__tests__/remote-terminal-menu.test.tsx src/__tests__/context-menu.test.tsx src/__tests__/ime-bridge.test.ts` 종료 코드 0, 61개 통과 (회귀 가드: 지금 61 통과).
  4. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0, 저장소 루트에서 `bun run test` 종료 코드 0이고 desktop 통과 수가 1502 이상 (회귀 가드: 지금 1502 통과·1 skipped).

## Work slices
- [ ] S1. `store.ts`의 `transferTab`: 터미널 탭을 허용하고(다른 가상 탭은 지금처럼 거부) 터미널은 항상 이동한다. 원래 패널에 탭이 하나뿐이면 터미널을 보내고 `virtual.base`를 보는 새 파일 탭(`newTab(base)`)으로 채운 뒤 읽는다(`reload`). 일반 탭 경로(복사 규칙)는 건드리지 않는다. 함수 위 주석(가상 탭 제외 설명)을 고친다 — completion criterion: DoD 1의 (a)~(f)
- [ ] S2. 시험 `terminal-tab-transfer.test.ts`에 DoD 1의 여섯 시험을 쓴다. 터미널 탭은 `terminalFocus`로 만들어(`FakeBackend`) 실제 구조(`virtual: { kind: "terminal", jobId, base, … }`)를 쓴다 — completion criterion: DoD 1
  (depends: S1)
