<!-- forge-slug: td-queue -->
<!-- task: 10 -->
<!-- priority: high -->
<!-- tdd: off -->
# td-queue: 작업 큐(순차 실행, 일시정지/재개/중단, 진행 이벤트)

## Goal / Non-goals
- Goal: docs/08-vfs-file-ops.md의 큐 요구(Q-01)를 `crates/td-queue`로 구현한다. 자체 구현(`sd-task-system` 이식 안 함). 복사/이동/삭제 작업을 큐에 넣으면 워커 스레드가 순차 실행하고, 작업별 상태(대기/실행/일시정지/완료/실패/중단)와 진행(현재 파일, 완료 항목 수/전체)을 이벤트로 알린다. 일시정지/재개/중단은 항목 경계에서 반영된다. `td-ops`의 복사/이동은 항목 단위 진행 콜백을 지원하도록 확장한다.
- Non-goals: UI(다음 태스크), 파일 내부 바이트 단위 진행/중단, 재시작 후 큐 복원.

## Source of truth
- Glossary terms: 큐(Operation Queue)
- Related ADRs: docs/adr/0003, 0005
- Definition of Done: `cargo test -p td-queue`(tempdir, 실제 디스크) 통과, 이름 지정 테스트: `queue_sequential_order`(여러 작업이 넣은 순서대로 하나씩 실행되고 동시 실행이 없다), `queue_pause_resume`(일시정지하면 다음 항목이 실행되지 않고 재개하면 이어진다), `queue_abort`(중단하면 남은 항목이 실행되지 않고 이미 끝난 항목은 유지, 상태가 aborted). 실패 항목은 오류 요약을 가진다. 기존 `td-ops` 테스트 유지.

## Work slices
- [ ] S1. td-ops 항목 단위 실행 API(진행 콜백, 취소 확인 지점) — completion criterion: 기존 td-ops 테스트 통과 + 새 단위 테스트
- [ ] S2. 큐 코어(작업 모델, 워커, 상태 전이, 이벤트 채널) — completion criterion: `queue_sequential_order` 통과 (depends: S1)
- [ ] S3. 일시정지/재개/중단 — completion criterion: `queue_pause_resume`, `queue_abort` 통과 (depends: S2)
- [ ] S4. 실패 처리와 오류 요약 — completion criterion: 실패 항목이 있어도 큐가 계속되고 요약에 남는 테스트 통과 (depends: S2)
