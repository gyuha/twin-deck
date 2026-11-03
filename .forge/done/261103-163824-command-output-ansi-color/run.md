# 실행 기록 — 명령어 줄 결과 창 ANSI 색 표시 (#211)

실행: core#6078(codex gpt-6.1-sol) S1, ui#64BE(claude-sonnet-5-5) S2·S3 병렬, review#2C86. TDD.

- S1 run_shell 색 강제 환경 변수 — ⚠ 구현했다가 되돌림: review가 `git diff > a.patch`·파이프·하위 스크립트 출력에 ANSI가 섞여 파일이 망가짐을 측정(923→1043바이트). 사용자 결정으로 색 강제 취소, crates 변경 없음
- S2 `lib/ansi.ts` SGR 해석기 — ⚠ 확장: review 지적으로 OSC·2바이트 ESC 제거, `\r` 덮어쓰기 처리 추가(계획엔 없던 범위)
- S3 결과 창 `AnsiText` 렌더 + 복사 시 ANSI 제거(`store.ts dialogCopyText`) — ✅ 계획대로(복사 경로가 Dialog가 아니라 store에 있어 거기서 처리)
- S4 실제 앱 확인 — 사용자 UAT 대기

## 계획 대비 어긋난 점
- 목표 축소(사용자 결정): 결과 창은 명령이 스스로 낸 색만 칠한다(예: `git diff --color`). 자동 색은 #212 터미널 팝업의 몫. 계획의 DoD 1(td-launch 색 강제 테스트)은 폐기.
- 중간에 core가 사용자 전역 `color.diff=auto`가 `color.ui=always`보다 우선함을 발견해 키 7개로 확장했으나, 같은 변경이 위 데이터 손상으로 함께 되돌려짐.
- 계획 작성(fg-ask 질문 6)에서 환경 변수 방식의 리다이렉트 손상 위험을 놓쳤다 — 회고 재료.
- 한계: `\r` 덮어쓰기는 글자 수 기준(전각 폭 미계산), 매우 큰 출력에서 셀 객체 메모리 증가.

## DoD baseline → after
1. td-launch 색 강제 테스트: 없음 → 폐기(변경 되돌림, `git status crates` 깨끗)
2. clippy td-launch: 해당 없음(변경 없음)
3. ansi.test.ts + run-command.test.tsx: ansi 없음 → 2파일 55개 통과
4. tsc --noEmit: 0 → 0; 전체 vitest 1740 통과
5. 실제 앱 확인: 대기
