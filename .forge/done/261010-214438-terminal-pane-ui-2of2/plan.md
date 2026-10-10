<!-- forge-slug: terminal-pane-ui-2of2 -->
<!-- task: 133 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# 내장 터미널 화면: 단축키로 반대편 패널에 ghostty 터미널을 띄운다 (2/2)

## 목표 / 하지 않을 것
- 목표: 폴더에서 `Mod+O`(`core.terminal.focus`)를 누르면 **반대편 패널 전체**를 그 폴더의 터미널(ghostty-web)이 대체한다. `Alt+Mod+O`(`core.terminal.toggle`)로 숨기고 다시 보인다(세션은 계속 돈다). 셸이 끝나면(`exit`, `Ctrl+D`) 패널이 파일 목록으로 돌아온다. (GitHub 이슈 #46)
  - 렌더러: `ghostty-web` 0.4.0(Ghostty VT 엔진 WASM). `init()`은 첫 사용 때 지연 로드하고 wasm은 JS 안에 base64로 내장돼 있어 별도 파일 요청이 없다. 입력은 `term.onData` → `terminalWrite`, 출력은 `onTerminalEvent` → `term.write`, 크기는 패널 크기에 맞춰 `terminalResize`.
  - 열기 규칙: 현재(활성) 탭이 가상 탭이 아니고 로컬 폴더일 때만 연다(아카이브 안·검색 결과는 알림 후 안 연다). 이미 터미널이 열려 있으면 새로 만들지 않고 포커스만 준다. 터미널이 포커스일 때 키는 거의 모두 pty로 가고(`terminal` 스코프), `Alt+Mod+O`·`Mod+O`만 앱이 받는다.
  - 문서: `docs/05-actions-keybindings.md`(두 액션의 상태와 키), `docs/01-feature-spec.md` TERM-01·02, `docs/03-tech-stack.md`(렌더러 xterm.js → ghostty-web), `README.md`·`README.en.md` 쌍.
- 하지 않을 것: 한 패널에 터미널 여러 개 · cwd 양방향 동기화(TERM-03) · 터미널 테마·글꼴·셸 설정(TERM-04) · 외부 터미널 실행 F11(TERM-05) · 재시작 복원 · 터미널을 패널 아래 절반에 두는 배치 · Windows/Linux 실행 검증

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음
- 관련 ADR: 없음
- 이슈 추적: GitHub 이슈 #46
- 완료 정의(DoD) = `.forge/loop.md`의 C4~C7
  1. `cd apps/desktop && bunx vitest run src/__tests__/terminal-pane.test.tsx` 통과 ≥ 6 (사전 상태: 파일 없음)
  2. `cd apps/desktop && bunx vite build` 성공하고 산출물 JS에 ghostty wasm(base64 내장)이 들어 있다
  3. 회귀 방지(이미 통과 중): vitest 전체 기준선 소음만, `tsc`·`clippy -p td-terminal`·`fmt --check` 통과, `fkey-bindings`·액션 테스트 통과
  4. 문서: `grep -c "core.terminal.focus" docs/05-actions-keybindings.md` ≥ 1 이미 있음(상태 열을 갱신), `grep -c "ghostty" docs/03-tech-stack.md` ≥ 1 (사전 0)

## 작업 조각
- [ ] S1. `ghostty-web` 설치, `TerminalView.tsx`(지연 `init`, 입력·출력·크기 연결, 언마운트 시 정리). — 완료 기준: DoD 1의 렌더러 연결 테스트(렌더러는 가짜로 바꿔 시험)
- [ ] S2. 스토어·액션: `terminal` 상태, `terminalFocus`·`terminalToggle`, 세션 종료 처리, 액션 두 개와 키·`terminal` 스코프 키 전달. (depends: S1) — 완료 기준: DoD 1
- [ ] S3. `Pane`/`App`: 반대편 패널이 터미널이면 `TerminalView`를 그린다. (depends: S2) — 완료 기준: DoD 1, 2
- [ ] S4. 테스트 `terminal-pane.test.tsx`와 문서. (depends: S3) — 완료 기준: DoD 1, 3, 4
