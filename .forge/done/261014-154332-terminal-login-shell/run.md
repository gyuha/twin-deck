# 실행 기록 — 내장 터미널을 로그인 셸로 연다 (이슈 #64)

워크플로 없이 직접 실행했다(변경이 `resolve_shell` 한 곳과 문서 세 줄이라 비용상 직접 처리가 낫다). TDD로 진행했다.

## 슬라이스별 결과
- S1 실패하는 테스트 먼저 — ✅ 계획대로. `resolve_shell_unix_args_are_login`은 `("/bin/zsh", [])` ≠ `["-l"]`로 실패했고, `login_shell_loads_zprofile_and_zshrc`는 `P= R=from_rc`를 출력해 `.zprofile` 표식만 빠졌다.
- S2 `resolve_shell` 비Windows 분기에 `-l` — ✅ 계획대로 (`/bin/sh` 폴백 포함).
- S3 문서 세 군데 — ✅ 계획대로 (`lib.rs` 주석, `docs/09` 기본 셸 줄, `docs/06` terminal 줄).
- S4 clippy·fmt — ✅ 계획대로.

## DoD baseline → after
1. `cargo test -p td-terminal login`: red(2건 실패) → green(2건 통과). red→green 확인됨.
2. `cargo test -p td-terminal resolve_shell_unix_args`: 실패(`[]`) → 통과.
3. `cargo test -p td-terminal` 전체: 13건 통과(기준선, 간헐 실패 안 나옴) → 15건 통과. `exit_code_comes_as_an_exit_event`는 이번에 재현되지 않았다.
4. clippy `-D warnings`·`fmt --check`: 통과 → 통과 (회귀 방어, 이미 통과 상태).
5. `grep -c "로그인"`: 0·0·0 → lib.rs 3, docs/09 1, docs/06 1.
- 추가: `cargo test -p twin-deck-desktop terminal` 1건 통과(`terminal_session_runs_in_folder_and_streams_output`).

## 계획과 다른 점
- 없음. 통합 테스트는 계획대로 `/bin/zsh`가 없으면 건너뛰도록 했다.

## 남은 한계
- 보고자 환경(brew로 설치한 `zoxide`·`starship`)에서 실제로 해결되는지는 확인하지 못했다. 자동 테스트는 `.zprofile`이 적용되는지까지만 증명한다.
- `lsd` 색상 테마는 비목표로 두었다. 배포 후 보고자에게 다시 확인을 요청해야 한다.
