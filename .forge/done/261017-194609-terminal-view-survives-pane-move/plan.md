<!-- forge-slug: terminal-view-survives-pane-move -->
<!-- task: 199 -->
<!-- tdd: off -->
# 패널을 옮겨도 터미널 화면(스크롤 내용)이 그대로 이어진다 (이슈 #96 ②)

## Goal / Non-goals
- Goal: 터미널 탭을 다른 패널로 옮겨도 **화면이 새로 그려지지 않고 그대로 이어진다.** 지금은 `Pane`이 터미널 탭마다 `TerminalView`를 `key={session}`으로 마운트하고, `TerminalView`가 마운트될 때 xterm 엔진을 만들어 pty 출력 구독을 걸고 언마운트될 때 엔진을 해제한다. 그래서 탭이 다른 패널로 가면 옛 엔진(스크롤 내용 포함)이 해제되고 새 패널에 빈 엔진이 생긴다. 엔진과 출력 구독을 **패널의 React 수명에서 떼어 세션 단위로 둔다**: 같은 세션이 다른 패널에 다시 마운트되면 **같은 엔진을 새 자리(host)로 옮겨 붙이고**(`open(el)`을 다시 부르면 새 element에 재부착·다시 맞춤), 옮기는 사이에 온 pty 출력도 놓치지 않는다. 터미널 탭이 닫히거나 셸이 끝나 어느 패널에도 마운트되지 않게 되면 엔진을 해제하고 구독을 푼다.
- Non-goals: 상태 쪽 이동 규칙(plan `terminal-tab-transfer-state`가 한다 — 이 plan은 그것이 먼저 봉인됐다고 전제한다). 터미널 화면의 저장·복원(앱을 껐다 켜도 유지하는 일). xterm 렌더러·글꼴 처리 변경. 설정 화면을 열거나 탭을 바꿀 때 숨기고 보이는 지금의 동작 변경(그대로 유지). Rust·`Backend` 인터페이스·생성 바인딩·의존성 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none (`ui/TerminalView.tsx`, `ui/Pane.tsx`, `lib/terminalEngine.ts`, 이슈 #46·#72)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/terminal-pane-move.test.tsx` 종료 코드 0, 테스트 6개 이상 통과 (파일이 없는 지금은 실패 — 앞으로 가야 할 검사). 시험은 `terminal-pane.test.tsx`처럼 화면 엔진을 가짜로 바꾸고(엔진마다 생성 횟수·`written`·`disposed`·`opened`를 기록), 터미널 탭을 `transferTab`으로 반대편 패널로 옮기며 최소 이 여섯을 단언한다: (a) 옮긴 뒤에도 엔진이 **새로 만들어지지 않는다**(생성 횟수 그대로)이고 `disposed`가 거짓이다 (b) 옮기기 **전에** 쓴 출력이 같은 엔진의 `written`에 그대로 남아 있고 옮긴 뒤 온 출력도 같은 엔진에 이어서 쓰인다(화면 유지) (c) 엔진의 `opened`(host)가 **새 패널의 구역 안**으로 바뀌고, 보이는 터미널은 새 패널에만 있고 옛 패널에는 없다 (d) 옮긴 뒤에도 입력이 세션으로 쓰이고 크기 변경이 세션으로 전해진다 (e) 옮기는 **도중**(옛 뷰가 해제되고 새 뷰가 붙기 전)에 온 출력도 놓치지 않는다(`written`에 순서대로 있다) (f) 옮긴 터미널 탭을 닫으면(`Mod+W`) 세션이 끝나고 엔진이 해제되며 출력 구독도 풀린다(닫은 뒤 온 출력이 더 이상 쓰이지 않는다).
  2. `cd apps/desktop && bunx vitest run src/__tests__/terminal-engine-reparent.test.ts` 종료 코드 0, 테스트 3개 이상 통과 (파일이 없는 지금은 실패). 실제 엔진(`createTerminalEngine`, `@xterm/xterm`·`@xterm/addon-fit`은 가짜로 바꾼 것)에 대해: (a) `open(el1)` 뒤 `open(el2)`를 부르면 xterm의 `Terminal.open`은 **한 번만** 불리고 xterm element가 `el2`로 옮겨 붙으며 다시 맞춘다(`fit` 호출) (b) 크기 관찰자가 옛 element에서 풀리고 새 element에 걸린다 (c) 재부착한 뒤 `dispose()`가 정상이다(관찰자 해제·`term.dispose` 호출).
  3. 기존 터미널·탭 시험이 수정 없이 통과한다: `cd apps/desktop && bunx vitest run src/__tests__/terminal-pane.test.tsx src/__tests__/terminal-engine.test.ts src/__tests__/remote-terminal.test.tsx src/__tests__/remote-terminal-connect.test.tsx src/__tests__/remote-terminal-menu.test.tsx src/__tests__/context-menu.test.tsx src/__tests__/ime-bridge.test.ts src/__tests__/tab-transfer-store.test.ts src/__tests__/tab-drag-cross-pane.test.tsx src/__tests__/tab-drag-edges.test.tsx src/__tests__/tab-drag-reorder.test.tsx` 종료 코드 0, 84개 이상 통과 (회귀 가드: 지금 84 = 61 + 23 통과 — 특히 `terminal-pane.test.tsx`의 "다른 탭으로 옮기면 숨겨지되 세션과 화면은 살아 있다", "탭을 닫으면 세션이 끝난다", "셸이 끝나면 탭이 사라진다", "설정을 열어도 지워지지 않는다"가 그대로 통과해야 한다).
  4. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0, 저장소 루트에서 `bun run test` 종료 코드 0이고 desktop 통과 수가 1502 이상 (회귀 가드).
  5. 문서(사전 상태는 모두 0): `grep -c "터미널 탭도 끌어" README.md` ≥ 1, `grep -ci "terminal tabs can also be dragged" README.en.md` ≥ 1, `grep -c "터미널 탭 이동" docs/07-ui-spec.md` ≥ 1. README 한·영은 한 쌍이라 함께 고친다(첫 줄의 언어 링크는 그대로).

## Work slices
- [ ] S1. `lib/terminalEngine.ts`: `open(el)`을 다시 부르면(이미 열린 엔진) xterm을 다시 열지 않고 **xterm element를 새 `el`로 옮겨 붙이고** 다시 맞춘 뒤(`fit.fit()`, 필요하면 `term.refresh`) 크기 관찰자·한글 입력 브리지를 새 `el`에 다시 건다. 첫 `open`의 동작은 그대로다. `TerminalEngine` 인터페이스 이름은 그대로 두고 문서 주석만 고친다(가짜 엔진을 쓰는 기존 시험이 깨지지 않게) — completion criterion: DoD 2
- [ ] S2. 세션 단위로 엔진을 보관하는 모듈(예: `lib/terminalSessions.ts`)과 `TerminalView` 개편: 엔진과 pty 출력 구독을 세션 번호별로 모듈이 들고, 엔진이 준비되기 전·옮기는 사이의 출력은 모아 두었다가 쓴다. `TerminalView`는 마운트 때 그 세션의 엔진을 얻어(없으면 만들어) 자기 host에 `open`하고, 언마운트 때는 바로 해제하지 않고 **참조를 줄인 뒤 다음 틱에 어디에도 마운트돼 있지 않을 때만** 엔진을 해제하고 구독을 푼다. 글꼴 반영·포커스·`shown` 처리는 지금과 같다 — completion criterion: DoD 1의 (a)~(f), DoD 3
  (depends: S1)
- [ ] S3. 시험 `terminal-pane-move.test.tsx`(DoD 1)와 `terminal-engine-reparent.test.ts`(DoD 2)를 쓴다. 가짜 엔진은 `terminal-pane.test.tsx`의 것을 따르되 같은 엔진에 `open`이 다시 불린 횟수도 기록한다 — completion criterion: DoD 1, DoD 2
  (depends: S2)
- [ ] S4. 문서: `README.md` 탭 끌기 항목과 `README.en.md`의 대응 항목에 터미널 탭도 끌어 옮길 수 있고 셸과 화면이 그대로 이어진다는 점(마지막 탭이면 원래 패널에 시작 폴더 탭이 생긴다)을 적고, `docs/07-ui-spec.md`에 "터미널 탭 이동" 설명을 더한다 — completion criterion: DoD 5
  (depends: S2)
