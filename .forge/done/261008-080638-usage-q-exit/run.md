# RUN — Disk Usage 탭에서 q로 나가기 (#26)

## 계획 대비 실제
- 계획대로: `usageExit`(store), `useKeyboard`의 물리 키(`e.code === "KeyQ"`) 처리, docs/07 항목, 테스트 11개.
- 계획과 다름: 없음.

## 학습
- 일반 글자 키는 Quick Select가 쓰므로 Keymap에 바인딩하지 못해 `useKeyboard`에서 특수 처리했다. 대가: Disk Usage 탭에서는 `q`로 시작하는 이름을 Quick Select로 고를 수 없다(docs/07에 기록).
- 실앱 검증 실패: `osascript` 키 입력은 맨 앞 앱으로 가는데, 격리 인스턴스가 맨 앞을 유지하지 못했다. 첫 시도에서는 키가 브라우저 검색창에 들어갔다(검색창에 `phoqcra`가 찍힘, 제출은 안 됨). 키 전송 직전에 맨 앞 pid를 확인해야 한다.
- 한글 입력기 상태의 실앱 동작은 미확인(jsdom에서 `ㅂ`/KeyQ 이벤트만 확인).
