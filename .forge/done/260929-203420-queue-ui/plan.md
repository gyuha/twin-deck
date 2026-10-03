<!-- forge-slug: queue-ui -->
<!-- task: 25 -->
<!-- priority: high -->
<!-- tdd: off -->
# 큐 UI: 진행 표시, 팝업, 키보드 조작과 브리지 연결

## Goal / Non-goals
- Goal: Q-02/Q-03. 파일 작업(복사/이동/삭제/휴지통)이 `td-queue`를 거치도록 Tauri command/event(`bindings.ts` 재생성)와 `Backend` 포트를 확장하고, 창 오른쪽 위 진행 표시(큐가 비면 사라짐)와 `=`로 여는 팝업(작업별 상태/진행/현재 파일/실패 요약, `queue` 스코프 키: 방향키/Space 이동, `P` 일시정지·재개, `A`/`D` 중단, `Esc` 닫기)을 만든다. FakeBackend도 큐를 흉내 낸다.
- Non-goals: 충돌 다이얼로그가 큐를 멈추는 상세 정책 개선(기존 항목별 질문 흐름 유지), 바이트 단위 진행.

## Source of truth
- Glossary terms: 큐
- Related ADRs: docs/adr/0003, 0007
- Definition of Done: `queue-ui.test.tsx` 통과(진행 표시 등장/소멸, `=` 팝업, P/A/D/Esc, 실패 요약 표시, 모두 키보드). `bindings_are_up_to_date` 포함 `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과. 기존 M1 테스트 전부 유지.

## Work slices
- [ ] S1. Tauri command/event 확장 + bindings 재생성 + Backend 포트/Tauri/Fake 구현 — completion criterion: cargo test, ts-client 테스트 통과
- [ ] S2. 스토어의 큐 상태와 파일 작업 액션을 큐 경유로 전환 — completion criterion: 기존 file-ops/keyboard-scenario 테스트 통과 (depends: S1)
- [ ] S3. 진행 표시와 팝업 UI, `queue` 스코프 키맵, `core.queue.open` 액션(`=`은 global 예약 키) — completion criterion: queue-ui.test.tsx 통과 (depends: S2)
