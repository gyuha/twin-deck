<!-- forge-slug: terminal-cmd-backspace -->
<!-- task: 154 -->
<!-- tdd: on -->
# 내장 터미널에서 Cmd+Backspace로 커서 앞을 지운다 (이슈 #63)

## 목표 / 비목표
- 목표: macOS에서 내장 터미널에 `Cmd+Backspace`를 누르면 셸에 `Ctrl+U`(`\x15`)를 보낸다. macOS Terminal.app은 시스템 키 바인딩 `Cmd+Backspace → deleteToBeginningOfLine:`을 받아 이 동작을 하는 것으로 보이지만(Terminal.app에서 바이트를 직접 확인하지는 못함 [중간]), 내장 터미널의 xterm.js는 이 키를 바이트로 바꾸지 않고 앱에도 대신하는 처리기가 없어 반응이 없다.
- 구현 방식: `crates`가 아니라 `apps/desktop/src/lib/terminalEngine.ts`의 `open`에서 xterm의 `attachCustomKeyEventHandler`로 `keydown`을 가로챈다. `metaKey`가 눌리고 `Ctrl`·`Alt`·`Shift`가 없는 `Backspace`일 때만 입력 경로(`sendData`, 한글 입력 브리지와 같은 길)로 `\x15`를 보내고 `false`를 돌려 xterm이 다시 처리하지 않게 한다. 그 밖의 키와 `keyup`은 `true`로 그대로 둔다. IME 조합 중(`isComposing`)에는 건드리지 않는다. 플랫폼 검사는 두지 않는다(`Win`·`Super` 키는 OS가 먼저 가져가 `metaKey+Backspace`가 앱까지 오는 것은 사실상 macOS뿐 [중간]).
- 비목표:
  - `Cmd+←`/`→`(줄 처음/끝), `Option+←`/`→`(단어 이동) 등 다른 macOS 텍스트 편집 키는 하지 않는다(질문 1에서 A로 결정). 필요하면 별도 이슈로 나눈다.
  - Windows·Linux의 `Ctrl+Backspace` 등은 건드리지 않는다.
  - `^U`가 지우는 범위(zsh 기본은 줄 전체, bash는 커서 앞)를 앱이 맞추지 않는다. 셸 설정의 몫이고 Terminal.app에서도 같다. 문서에 한 줄만 적는다.

## 진실의 원천
- 용어: 없음
- 관련 ADR: 없음
- 정의 완료(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/terminal-engine.test.ts -t "Cmd\+Backspace"` → 새 테스트가 통과한다. **red→green**: 작성 시점에는 이 필터에 맞는 테스트가 없어(5건 모두 skipped) 앞으로 향하는 확인이다. S1에서 처리기가 없는 현재 코드에 대해 새 테스트가 실패하는 것을 실제로 확인해 run 기록에 남기고(`attachCustomKeyEventHandler`가 없거나 `\x15`가 안 나옴), 수정 후 통과한다.
  2. 새 테스트는 다음을 검증한다: (a) `Cmd+Backspace` keydown → `\x15` 전송 + `false`, (b) 일반 `Backspace`·`Cmd+다른 키`·`Ctrl/Alt/Shift`가 함께 눌린 `Cmd+Backspace`는 전송 없이 `true`, (c) `keyup`은 전송 없이 `true`, (d) `isComposing` 중에는 전송 없이 `true`.
  3. `cd apps/desktop && bunx vitest run src/__tests__/terminal-engine.test.ts` 전체 통과(기준선 5건 통과 → 새 테스트를 더한 건수). 이미 통과 중인 기존 5건은 회귀 방어다.
  4. `cd apps/desktop && bunx tsc --noEmit`와 desktop vitest 전체가 통과한다. 단, `compress-symlink` 등 병렬 실행에서 간헐적으로 실패하는 테스트가 있다(이번 세션에서 PR #66 검증 중 관찰: 전체 실행에서 1건 실패, 단독·재실행은 통과). 실패가 이 변경과 무관한 파일이면 단독 재실행으로 통과를 확인한다.
  5. 문서가 이 동작을 말한다: `grep -c "Cmd+Backspace" docs/09-platform-support.md apps/desktop/src/lib/terminalEngine.ts` → 파일마다 `≥1`. (작성 시점에 둘 다 0건이라 앞으로 향하는 확인이다. 문서 위치는 `docs/09-platform-support.md`의 "8. 터미널" 절이다.)
  - 이 DoD는 실제 앱(WKWebView)에서 셸까지 닿는지는 증명하지 못한다. 그 부분은 자동화하지 않고 사용자(보고자) 확인이 필요하다: 내장 터미널에서 글자를 입력한 뒤 `Cmd+Backspace`를 눌러 지워지는지 본다.

## 작업 조각
- [ ] S1. 먼저 실패하는 테스트를 쓴다(`apps/desktop/src/__tests__/terminal-engine.test.ts`): 가짜 `Terminal`에 `attachCustomKeyEventHandler`를 달아 등록된 처리기를 잡고, `createTerminalEngine()`으로 엔진을 연 뒤 `onData`로 받은 콜백이 `\x15`를 받는지, 처리기의 반환값이 `false`/`true`인지 본다. DoD 2의 (a)~(d)를 모두 포함하고 테스트 이름에 `Cmd+Backspace`를 넣는다. — 완료 기준: 새 테스트가 현재 코드에서 실패하고, 실패 출력을 run 기록에 남긴다.
- [ ] S2. `terminalEngine.ts`의 `open`(또는 엔진 생성부)에서 `term.attachCustomKeyEventHandler`를 등록한다. `sendData`는 `onData`로 정해지므로 처리기는 호출 시점의 `sendData`를 쓴다. — 완료 기준: DoD 1·2·3이 통과한다. (depends: S1)
- [ ] S3. `docs/09-platform-support.md`의 "8. 터미널" 절에 한 줄을 더한다: macOS에서 `Cmd+Backspace`는 셸에 `Ctrl+U`를 보내며, 지워지는 범위는 셸 설정을 따른다(zsh 기본은 줄 전체, bash는 커서 앞). `terminalEngine.ts` 처리기에는 이유(xterm이 이 키를 바이트로 바꾸지 않음)를 주석으로 남긴다. — 완료 기준: DoD 5가 통과한다. (depends: S2)
- [ ] S4. 타입 검사와 desktop vitest 전체를 돌린다. — 완료 기준: DoD 4가 통과한다. (depends: S3)
