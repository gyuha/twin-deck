# run — 내장 터미널 화면 (2/2, 이슈 #46)

fg-run이 워크플로 없이 직접 실행했다.

## 슬라이스별 결과
- S1 `ghostty-web` 0.4.0 설치, `lib/terminalEngine.ts`(지연 `import`·`init()`·`FitAddon`)와 `ui/TerminalView.tsx`(입력→`terminalWrite`, 출력→`write`, 크기→`terminalResize`, 엔진 준비 전 출력은 모았다가 씀) — ✅ as planned
- S2 스토어·액션: `terminal` 상태, `terminalFocus`·`terminalToggle`·`terminalExited`, `activate`가 포커스를 터미널/파일 쪽으로 돌림, `terminal` 스코프(`["terminal"]`만), 액션 2개와 `Mod+O`·`Alt+Mod+O` 바인딩(pane·terminal 양쪽) — ✅ as planned. `createAppStore`가 `backend`도 돌려주도록 했다(화면이 세션 입출력에 쓴다)
- S3 `Pane.tsx`: 반대편 패널이 터미널이면 `TerminalView`를 그림 — ✅ as planned
- S4 테스트 9건, 문서(`01`·`03`·`05`, README 쌍) — ⚠ 계획에 없던 수정 하나: `i18n-rust-messages.test.ts`가 `td-terminal`의 새 한국어 오류 문구를 잡아 대응표(`rust.ts`)에 영어 문구를 더했다

## 정지 조건 계약의 정정 (드라이브 시작 후)
- C6의 "wasm 파일이 산출물에 있다"는 틀린 가정이었다. `ghostty-web`은 wasm을 JS 안에 base64 데이터 주소로 내장해서 별도 `.wasm` 파일이 나오지 않는다. 검사를 "JS에 `data:application/wasm;base64`가 있다(사전 0 → 1)"로 바로잡았다. 검사를 느슨하게 한 것이 아니라 잘못 세운 전제를 코드로 확인해 고친 것이다.

## DoD baseline → after
1. `cargo test -p td-terminal` 5 · `twin-deck-desktop terminal` 1 · `up_to_date` 2 · ts-client vitest 58(터미널 3)
2. `terminal-pane.test.tsx` 9건 통과 (사전: 파일 없음)
3. vitest 전체 1138 통과, 실패는 기준선 `pdf-preview`와 `model-formats` 파일 로드뿐 / `tsc` · `fmt` · `clippy -p td-terminal -p td-config` 통과 / `packages/actions` 19 / `twin-deck-desktop` 97 / ko·en 키 일치
4. `vite build` 성공, JS 1개에 wasm 내장 / `cargo build` 성공
5. 문서: `ghostty`가 `03-tech-stack`·`README`·`README.en`에 각 1, `05`의 `core.terminal.focus` 줄 갱신

## 어긋난 점·한계
- **실제 WKWebView에서 ghostty-web이 그려지고 키가 입력되는지는 검증하지 못했다.** jsdom에는 canvas·WASM이 없어 화면 엔진은 가짜로 바꿔 시험했다. 번들에 wasm이 들어가는 것과 빌드가 되는 것까지만 확인했다. `ghostty-web`은 0.4.0이고, 이 앱의 `csp: null`과 `data:` 주소 `fetch`가 WKWebView에서 되는지는 눈으로 봐야 한다.
- 터미널에 포커스가 있을 때 키는 `terminal` 스코프만 보므로 앱 단축키는 `Mod+O`·`Alt+Mod+O` 둘뿐이다. 파일 쪽으로 돌아오려면 `Alt+Mod+O`(숨김)이나 파일 패널 클릭이다. 터미널 안에서 `Tab`으로 패널을 바꾸지 못한다.
- 세션은 앱 전체에 1개다. 앱을 끌 때 세션을 명시적으로 닫지 않는다(프로세스 종료로 pty가 끊긴다).
- 터미널 글꼴·색은 고정값이다(테마·설정은 범위 밖).
- Windows·Linux는 컴파일 확인뿐이다.
