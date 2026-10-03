# RUN — ui-file-ops-scenario
- S1 파일 작업 액션 핸들러 + 이름 입력/삭제 확인 다이얼로그 — ✅ (OP-01/02/05/06/07)
- S2 충돌 다이얼로그 — ✅ 방향키+Return 또는 O/S/R. ⚠ "모두에 적용"은 만들지 않았다(항목마다 질문), 취소하면 남은 항목도 중단
- S3 감시 이벤트로 목록 갱신 — ✅ FakeBackend 이벤트로 검증. 실제 Tauri 왕복은 미검증
- S4 keyboard-scenario.test.tsx — ✅ 마우스 조작 0건
- S5 docs/m1-status.md — ✅ 18개 ID done, 한계와 M0/M1 완료 기준 대조 기록
테스트 함정 기록: seal 전 검증 스크립트(fmt/clippy/test/typecheck/build)를 seal.sh에 넣기 전에 clippy 실패가 `| tail`에 가려 봉인·커밋된 적이 있음(td-vfs, 후속 커밋으로 수정).
DoD: vitest 36 passed, cargo test 23 passed, 정지 조건 C1~C9 전부 통과.
