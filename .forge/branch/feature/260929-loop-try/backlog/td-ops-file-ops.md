<!-- forge-slug: td-ops-file-ops -->
<!-- task: 3 -->
<!-- priority: high -->
<!-- tdd: off -->
# td-ops: 복사/이동/이름 변경/삭제와 충돌 처리

## Goal / Non-goals
- Goal: docs/08-vfs-file-ops.md대로 `crates/td-ops`에 OP-01~07 실행 로직(새 폴더(중첩)·새 파일·복사·이동·이름 변경·휴지통·영구 삭제)과 이름 충돌 정책(덮어쓰기/건너뛰기/이름 바꿈)을 구현한다. 자체 구현 결정이므로 `sd-task-system`은 쓰지 않고, 디렉터리 재귀 복사/이동은 순차 실행되는 단순 실행기로 만든다.
- Non-goals: 큐 UI, 일시정지/재개/중단(M2), 진행률 UI, 아카이브.

## Source of truth
- Glossary terms: 큐(Operation Queue)
- Related ADRs: docs/adr/0005
- Definition of Done: `cargo test -p td-ops`가 통과. 이름 있는 테스트가 존재하고 통과: `conflict_overwrite`, `conflict_skip`, `conflict_rename`, `trash_moves_to_trash`(tempdir 파일이 원위치에서 사라짐 — 테스트에서 실제 사용자 휴지통을 오염시키지 않도록 `trash` 크레이트 호출을 trait로 감싸 fake로 검증하고, 실제 구현은 별도 `#[cfg]`가 아닌 트레잇 구현체로 존재), `permanent_delete`, `keyboard_flow_copy_move_rename_delete`(`tests/scenario.rs`: 활성 패널 경로 → 비활성 패널 경로로 복사, 이동, 이름 변경, 삭제를 연속 수행하고 최종 디스크 상태 단언). 디렉터리 복사는 재귀이고 심볼릭 링크는 링크로 복사. 대상이 자기 하위일 때 거부.

## Work slices
- [ ] S1. 작업 계획(plan) 구조체: Copy/Move/Rename/Mkdir/Touch/Trash/Delete 요청과 충돌 정책 — completion criterion: 단위 테스트 통과
- [ ] S2. 실행기: 복사/이동(같은 볼륨 rename, 아니면 복사+삭제)/이름 변경/mkdir/touch — completion criterion: tempdir 통합 테스트 통과 (depends: S1)
- [ ] S3. 충돌 처리 3종 + 자기 하위 복사 거부 — completion criterion: `conflict_overwrite`, `conflict_skip`, `conflict_rename` 통과 (depends: S2)
- [ ] S4. 휴지통(trait로 추상화, `trash` 크레이트 구현체 + fake) / 영구 삭제 — completion criterion: `trash_moves_to_trash`, `permanent_delete` 통과 (depends: S2)
- [ ] S5. `tests/scenario.rs` 종단 시나리오 — completion criterion: `keyboard_flow_copy_move_rename_delete` 통과 (depends: S3, S4)
