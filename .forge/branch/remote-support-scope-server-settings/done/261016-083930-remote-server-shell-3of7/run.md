# run — Twin Deck Remote 서버 PTY 셸 채널과 클라이언트 셸 열기 (3/7)

워크플로 없이 직접 실행했다.

- S1 서버 쪽 PTY 셸 채널 — ✅ 계획대로 (`server/shell.rs`, `td-terminal`의 `Terminals` 재사용. `td-remote`가 `td-terminal`에 의존하게 됨)
- S2 `allow_shell` 게이트 — ✅ 계획대로 (`ServerConfig.allow_shell`, 꺼져 있으면 셸 요청 거부, 한 채널에 셸 하나)
- S3 클라이언트 `ShellSession::open/write/resize/close` + `events` — ✅ 계획대로 (`stty size`로 크기 변경 확인)

DoD baseline → after:
- `cargo test -p td-remote server_shell` : 0개 → 3 passed (마커 수신, 허용 안 함 거부, 크기 변경)
- clippy --all-targets -D warnings, td-remote 전체 테스트 3회 반복: 통과 → 통과(불안정 없음)

참고: Windows는 컴파일만 가정한다(셸 테스트는 `cfg(unix)`). 로컬 컴파일은 macOS에서만 확인했다.
