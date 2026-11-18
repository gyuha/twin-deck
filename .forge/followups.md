# Follow-ups

<!-- followup: fu-49a2ef21eb87 | source: command-line-terminal-popup | task: 212 | date: 2026-11-03 | status: open | taken: - -->
- Windows에서 터미널 팝업(`resolve_shell_line`: cmd `/C`, powershell `-Command`, gitbash `--login -c`)을 실제로 실행해 확인한다.
  Evidence: macOS에서는 순수 함수 단위 테스트와 Windows 대상 clippy만 확인했고 ConPTY 실행은 검증하지 못했다.

<!-- followup: fu-a1c4e7b29d10 | source: shortcut-editor-1of2 | task: 214 | date: 2026-11-18 | status: open | taken: - -->
- `i18n-rust-messages` 테스트의 기존 실패: `crates/td-launch/src/lib.rs:490`의 테스트 리터럴 `한글 출력`을 내부용 목록에 넣는다.
  Evidence: 단축키 작업 전(stash 상태)에도 같은 1건이 실패했다.

<!-- followup: fu-5b82d0e6f3a4 | source: shortcut-editor-2of2 | task: 215 | date: 2026-11-18 | status: open | taken: - -->
- 기본 키를 스코프별로 해제하는 문법(예: `{ id = "none", scope = "pane" }`)을 추가해, 여러 스코프에서 쓰는 기본 키(Enter 등)도 한 줄에서만 뺄 수 있게 한다.
  Evidence: 지금 `"none"`은 모든 스코프에서 지워서 편집기가 그 경우를 막고 안내만 한다.
