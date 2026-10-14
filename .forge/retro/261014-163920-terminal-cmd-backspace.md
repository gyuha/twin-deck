# 2026-10-14 — 내장 터미널에서 Cmd+Backspace로 커서 앞을 지운다 (이슈 #63)

## 계획 대비 실제
- 계획대로 된 것: 테스트 먼저(red: 처리기 미등록 3건 실패) → `terminalEngine.ts`에 `attachCustomKeyEventHandler` → 문서 한 줄 → 전체 검증. desktop vitest 1304건과 `tsc`가 한 번에 통과했다.
- 어긋난 것: 처리기를 계획의 `open`이 아니라 엔진 생성부에 등록했다(가짜 xterm 테스트가 쉽고 결과는 같다). `e.preventDefault()`를 방어적으로 추가했다. 둘 다 작은 조정이다.

## 배운 점
- 다음에 다르게 할 것:
  - 터미널 키 증상은 "셸 / 터미널 에뮬레이터 / OS 중 어디가 키를 바이트로 바꾸는가"부터 가른다. 이번에는 사용자가 "터미널 설정이나 셸 기능일 수 있다"고 짚어 줘서 확인했고, 셸은 바이트만 받으며(zsh `^U`는 줄 전체, bash는 커서 앞), Terminal.app 프로필·내장 매핑표에 `Cmd` 항목이 없고, macOS 시스템 키 바인딩(`StandardKeyBinding.dict`)에 `Cmd+Backspace → deleteToBeginningOfLine:`이 있음을 확인했다. 비슷한 키 이슈(`Cmd+←/→`, `Option+←/→`)도 같은 순서로 보면 빠르다.
  - Terminal.app이 그 명령을 `^U`로 바꿔 보낸다는 마지막 고리는 추정이다. 실제 키를 눌러 바이트를 찍어 본 것이 아니므로, 보고자에게 내장 터미널에서의 동작과 사용하는 셸을 확인해 달라고 이슈에 요청하는 편이 안전하다.
  - xterm을 쓰는 엔진 테스트는 가짜 `Terminal`에 필요한 메서드(`attachCustomKeyEventHandler`, `onData`)를 더하고 `mocks`에 처리기를 모아 두면 키 이벤트를 합성해 검증할 수 있다(`terminal-engine.test.ts`).
  - 전체 vitest 병렬 실행의 간헐 실패(`compress-symlink` 등)는 이번에는 나오지 않았다. 계속 나오면 별도로 다룬다.

## 문서 갱신
- CONTEXT.md 승급: 없음
- ADR 추가: 없음
- 회귀 검사(eval): 이번 작업이 `terminal-engine.test.ts`에 직접 추가한 테스트 3건(`Cmd+Backspace` 전송·보내지 않는 경우·`keyup`/IME)이 그 역할을 한다.
