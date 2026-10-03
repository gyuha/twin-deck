# RUN — td-queue
- S1 td-ops 항목 단위 API — ✅ `Control` trait(on_item/should_stop), `copy_with`/`move_with`; 기존 `copy`/`move_to`는 NoControl로 위임. 테스트 `copy_with_control_reports_items_and_can_stop`
- S2 큐 코어 — ✅ 워커 스레드 1개, 이벤트 채널, JobInfo 스냅샷. 테스트 훅(`with_hook`)으로 실행 순서를 결정적으로 제어
- S3 일시정지/재개/중단 — ✅ 항목 경계에서 반영. 중단해도 뒤 작업은 계속된다
- S4 실패 요약 — ✅ 실패 항목은 errors에 남고 job 상태는 Failed
설계 메모: 일시정지/중단은 항목(최상위 파일/폴더) 경계 + 폴더 복사 안의 파일 경계에서 확인. 파일 내부 바이트 단위는 아님. 훅은 항목 시작 시(일시정지 확인 전)에 호출된다.
DoD: cargo test -p td-queue 5 passed(20회 반복 실패 0), td-ops 13 passed.
