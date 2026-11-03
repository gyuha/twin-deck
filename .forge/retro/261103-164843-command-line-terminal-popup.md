# 2026-11-03 — 명령어 줄 실행 시 터미널 팝업 띄우기 옵션 (#212, 이슈 #157 ③)

## 계획 대비 실제
- 계획대로 된 것: core(`Terminals::open_line`, `behavior.command_line_terminal`) → bridge(`terminal_open_line`, gen-types, backend/tauri/fake) → ui(`LineTerminal` 팝업, 설정 스위치) 순서로 TDD 진행. 사용자 UAT 한 번에 통과.
- 어긋난 것:
  - review가 짧은 명령의 이벤트 경쟁을 찾음(높음): `terminalOpenLine`이 세션 번호를 돌려주기 전에 출력·종료 이벤트가 와서 `echo hi` 같은 명령의 출력과 종료 안내가 사라질 수 있음 → 등록 전 이벤트 버퍼 후 `acquireTerminal`의 `initial`로 전달.
  - "실행 중 키는 모두 pty로"만으로는 Ctrl+C를 무시하는 명령에서 팝업에 갇힘 → 마우스 전용 "중단" 버튼(계획 확장).
  - `dispose()`가 팝업 pty 세션을 닫지 않아 자식 프로세스가 남을 수 있었음 → 정리 추가.
  - 설정은 체크박스 대신 화면 관례인 스위치. bridge는 service.rs 단위 테스트 없이 끝내고 최종 보고 없이 종료 — 오케스트레이터가 diff·`up_to_date`로 확인.

## 배운 점
- 다음에 다르게 할 것:
  - "프로세스를 시작하고 번호를 돌려준 뒤 그 번호로 이벤트를 구독"하는 API는 반환 전 이벤트 경쟁이 생긴다. 계획 단계에서 "바로 끝나는 명령" 시나리오를 완료 조건 테스트로 넣는다.
  - 모든 키를 하위 프로그램에 넘기는 모달은 키가 아닌 탈출구(버튼)를 처음부터 설계에 넣는다.
  - 모달이 소유한 외부 자원(pty 세션)은 닫기 경로뿐 아니라 앱 정리(dispose) 경로까지 체크리스트로 본다.

## 문서 갱신
- CONTEXT.md 승급: 없음
- ADR 추가: 없음

## 후속 후보
<!-- followup: fu-49a2ef21eb87 | source: command-line-terminal-popup | task: 212 | date: 2026-11-03 | status: open | taken: - -->
- Windows에서 터미널 팝업(`resolve_shell_line`: cmd `/C`, powershell `-Command`, gitbash `--login -c`)을 실제로 실행해 확인한다.
  Evidence: macOS에서는 순수 함수 단위 테스트와 Windows 대상 clippy만 확인했고 ConPTY 실행은 검증하지 못했다.
