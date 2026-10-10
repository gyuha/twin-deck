<!-- forge-slug: terminal-backend-1of2 -->
<!-- task: 132 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# 내장 터미널 백엔드: portable-pty 세션과 출력 이벤트 (1/2)

## 목표 / 하지 않을 것
- 목표: 폴더를 cwd로 셸을 띄우는 pty 세션을 Rust에서 열고, 입력을 쓰고, 크기를 바꾸고, 닫을 수 있다. 출력과 종료는 이벤트로 화면에 전달된다. (GitHub 이슈 #46의 백엔드 절반)
  - 새 크레이트 `td-terminal`(문서 `docs/02-architecture.md`의 계획): `open(cwd, cols, rows) -> id`, `write(id, bytes)`, `resize(id, cols, rows)`, `close(id)`. 출력은 읽기 스레드가 콜백으로 낸다. 셸은 `$SHELL`(없으면 macOS/Linux `/bin/sh`, Windows `cmd.exe`).
  - 브리지: `Service`에 `terminal_open/write/resize/close`, 명령 4개, 이벤트 `terminal_output {id, data(base64)}`·`terminal_exit {id, code}`(바이트가 UTF-8 중간에서 잘려도 깨지지 않게 base64). `task gen-types`로 바인딩 재생성.
  - ts-client: `Backend.terminalOpen/Write/Resize/Close`, `onTerminalEvent(cb)`; `TauriBackend`는 명령·이벤트 연결(base64 → `Uint8Array`), `FakeBackend`는 세션 기록(`terminalWrites`)과 `emitTerminalOutput`·`emitTerminalExit`.
- 하지 않을 것: 화면(UI)·액션·키 · ghostty-web 설치 · 설정 키 · 셸 통합으로 cwd 동기화 · Windows/Linux 실행 검증(컴파일 확인만) · 앱 종료 시 세션 복원

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음
- 관련 ADR: 없음
- 이슈 추적: GitHub 이슈 #46
- 완료 정의(DoD) = `.forge/loop.md`의 C1~C3, C6
  1. `cargo test -p td-terminal` 통과 ≥ 4 (사전 상태: 크레이트 없음 — 앞으로 가는 확인)
  2. `cargo test -p twin-deck-desktop terminal` 통과 ≥ 1, `up_to_date` 통과
  3. `cd packages/ts-client && bunx vitest run` 통과, 터미널 계약 테스트 포함

## 작업 조각
- [ ] S1. `crates/td-terminal`: 세션 열기·쓰기·크기 변경·닫기, 읽기 스레드가 출력·종료를 콜백으로 낸다, 테스트(실제 셸로 echo·종료 코드·쓰기·크기·닫기). — 완료 기준: DoD 1
- [ ] S2. 브리지: `Service`·명령·이벤트·`gen-types`, 서비스 테스트. (depends: S1) — 완료 기준: DoD 2
- [ ] S3. ts-client: `Backend`·`TauriBackend`·`FakeBackend`와 계약 테스트. (depends: S2) — 완료 기준: DoD 3
