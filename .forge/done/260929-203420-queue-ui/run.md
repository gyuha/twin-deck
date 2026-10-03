# RUN — queue-ui
- S1 Tauri command/event 확장 + bindings 재생성 + Backend 포트 — ✅ `enqueue_job`/`queue_*` 명령, `QueueChanged` 이벤트(스냅샷 푸시), 동기 copy/move/trash/delete 명령 제거. FakeBackend는 instant/manual 모드로 큐 흉내(`advance()`로 한 항목씩)
- S2 스토어/파일 작업의 큐 경유 — ✅ 충돌은 큐에 넣기 전에 항목마다 질문, 취소하면 그때까지 정한 항목만 큐에. 상태 변화 시 목록 재조회
- S3 UI — ✅ 우상단 진행 표시, `=` 팝업(queue 스코프: ↑↓/Space, P, A/D, Esc), 실패 요약. 팝업이 열리면 패널 키 차단(scope stack `["queue","global"]`)
⚠ 발견한 문제: zustand 5에서 셀렉터가 새 배열을 반환하면 무한 렌더 → 파생은 컴포넌트에서. 부팅 테스트 IPC 모킹이 queue_jobs에 null을 돌려주어 미처리 예외가 났고(테스트가 통과해도 exit 1), 모킹을 실제 계약(배열)에 맞춤.
⚠ 미검증: 실제 Tauri 런타임에서 QueueChanged 이벤트 수신과 진행 표시(Rust 서비스 테스트와 UI fake 테스트로 각각만 검증).
DoD: desktop vitest 45+ passed(queue-ui 7), cargo desktop 6 passed(bindings drift 포함).
