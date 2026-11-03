# 실행 기록 — 명령어 줄 실행 시 터미널 팝업 띄우기 옵션 (#212)

실행: core#6078(S1·S2) → bridge#EFC4(S3) → ui#64BE(S4), review#2C86. TDD.

- S1 `Terminals::open_line` + `resolve_shell_line`(unix -l -c, cmd /C, powershell -Command, gitbash --login -c) — ✅ 계획대로
- S2 `behavior.command_line_terminal`(기본 false) — ✅ 계획대로
- S3 Tauri `terminal_open_line`, `Backend.terminalOpenLine`, FakeBackend 기록 — ⚠ service.rs 단위 테스트 없음(실행 경로는 td-terminal 통합 테스트가 덮음), 최종 보고 없이 종료 — 결과는 오케스트레이터가 확인
- S4 `LineTerminal` 팝업·설정 스위치·전역 키 차단 — ⚠ review 반영: 세션 등록 전 이벤트 버퍼(높음), 실행 중 '중단' 버튼(중간), dispose 시 terminalClose(중간). 체크박스 대신 기존 화면 관례인 스위치
- S5 실제 앱 확인 — 사용자 UAT 대기

## 계획 대비 어긋난 점
- 계획의 "실행 중 키는 모두 pty로"만으로는 Ctrl+C를 무시하는 명령에서 갇힘 → 마우스 전용 중단 버튼 추가(계획 확장).
- 짧은 명령의 이벤트 경쟁(반환 전 출력·종료)은 계획에 없던 위험 — review가 발견.
- core 기존 테스트 `output_arrives_and_runs_in_the_given_folder` 첫 실행 1회 실패 후 재실행 통과(타이밍 민감 추정).
- 한계: React StrictMode 개발 모드에서 팝업이 열린 채 dispose→init이 돌면 세션이 닫힐 수 있음(일반 실행 무관).

## DoD baseline → after
1. cargo test -p td-terminal: 새 테스트 없음 → 17+17 통과
2. cargo test -p td-config: 기본값 테스트 없음 → 72+12 통과
3. up_to_date: 통과 → 통과
4. clippy td-terminal td-config: 통과(에이전트 보고)
5. command-line-terminal·run-command·settings: 첫 파일 없음 → 81 통과
6. tsc: 0 → 0; 전체 vitest 1749 통과
7. 실제 앱 확인: 대기
