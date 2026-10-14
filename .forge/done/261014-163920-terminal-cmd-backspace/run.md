# 실행 기록 — 내장 터미널에서 Cmd+Backspace로 커서 앞을 지운다 (이슈 #63)

워크플로 없이 직접 실행했다(변경이 엔진 한 곳과 문서 한 줄이라 비용상 직접 처리가 낫다). TDD로 진행했다.

## 슬라이스별 결과
- S1 실패하는 테스트 먼저 — ✅ 계획대로. 새 테스트 3건이 모두 `expected undefined to be defined`(처리기 미등록)로 실패했다. 가짜 `Terminal`에 `attachCustomKeyEventHandler`·`onData`와 `mocks.keyHandlers`를 더했다.
- S2 `terminalEngine.ts`에 키 처리기 등록 — ✅ 계획대로. 엔진 생성부(`new Terminal` 직후)에 등록했다. `e.preventDefault()`도 호출한다(계획에는 없던 안전장치).
- S3 문서 — ✅ 계획대로. `docs/09-platform-support.md` "8. 터미널" 절에 한 줄, `terminalEngine.ts`에 이유 주석.
- S4 타입 검사·전체 vitest — ✅ 계획대로.

## DoD baseline → after
1. `-t "Cmd\+Backspace"`: 5 skipped(맞는 테스트 없음) → 3 passed. 수정 전 코드에서는 3건 모두 실패(red 확인).
2. 새 테스트 (a) `\x15` 전송 + `false` + `defaultPrevented`, (b) 일반 Backspace·`Ctrl/Alt/Shift`+Cmd+Backspace·`Cmd+c`는 `true`·전송 없음, (c)·(d) `keyup`과 `isComposing`은 `true`·전송 없음: 해당 없음 → 모두 통과.
3. `terminal-engine.test.ts` 전체: 5 passed → 8 passed. 기존 5건은 회귀 방어로 이미 통과 상태였다.
4. `tsc --noEmit` 통과, desktop vitest 전체: 1304건 통과(156 파일). 간헐 실패는 이번에는 재현되지 않았다.
5. `grep -c "Cmd+Backspace"`: docs/09 0, terminalEngine.ts 0 → 각 1.

## 계획과 다른 점
- 처리기를 `open`이 아니라 엔진 생성부에 등록했다. `open`은 DOM(`installImeBridge`)이 필요해 가짜 xterm 테스트에서 호출하기 번거롭고, 등록 시점은 결과에 영향이 없다.
- `e.preventDefault()`를 추가했다(웹뷰 기본 동작이 빈 textarea에서 `deleteContentBackward`를 내는 일을 막으려는 방어). 테스트가 `defaultPrevented`를 확인한다.

## 남은 한계
- 실제 앱(WKWebView)에서 `Cmd+Backspace`가 셸에 닿는지는 자동 테스트로 증명하지 못한다. 사용자 확인이 필요하다: 내장 터미널에서 글자를 입력한 뒤 `Cmd+Backspace`를 눌러 지워지는지 본다.
- macOS Terminal.app이 이 키를 `^U`로 바꿔 보낸다는 근거는 시스템 키 바인딩(`deleteToBeginningOfLine:`)에서 온 추정이며 Terminal.app에서 바이트를 직접 확인하지 않았다.
