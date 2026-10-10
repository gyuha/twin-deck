# run — 내장 터미널 백엔드 (1/2, 이슈 #46)

fg-run이 워크플로 없이 직접 실행했다.

## 슬라이스별 결과
- S1 `crates/td-terminal`(portable-pty 0.9): `open`·`open_command`·`write`·`resize`·`close`, 읽기 스레드가 `Output`·`Exit`을 낸다. 실제 셸 테스트 5건 — ✅ as planned
- S2 브리지: `Service::terminal_*`, 명령 4개, 이벤트 `TerminalOutput`(base64)·`TerminalExit`, `main.rs`의 전달 스레드, `gen-types` — ✅ as planned (입력은 계획대로 글, 출력은 바이트라 base64)
- S3 ts-client: `Backend`·`TauriBackend`·`FakeBackend`(+`emitTerminalOutput`·`emitTerminalExit`), `decodeBase64`, 테스트 3건 — ✅ as planned

## DoD baseline → after
1. `cargo test -p td-terminal` 5건 통과 (사전: 크레이트 없음)
2. `cargo test -p twin-deck-desktop terminal` 1건 통과, `up_to_date` 통과
3. `packages/ts-client` vitest 58건 통과(터미널 3건 포함)
4. fmt·`clippy -p td-terminal -D warnings` 통과

## 어긋난 점
- 포트 터미널 출력의 `close` 뒤 `Exit` 이벤트는 읽기 스레드가 낸다(프로세스를 죽이면 EOF). `close`는 세션을 즉시 지우므로 그 뒤 `write`·`resize`는 오류다.
- Windows·Linux는 컴파일만 확인(`cfg(unix)` 테스트는 macOS에서만 돈다).
