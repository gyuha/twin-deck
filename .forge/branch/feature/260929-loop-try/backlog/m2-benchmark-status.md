<!-- forge-slug: m2-benchmark-status -->
<!-- task: 19 -->
<!-- priority: low -->
<!-- tdd: off -->
# M2 벤치마크, 종단 시나리오, 상태 문서

## Goal / Non-goals
- Goal: 앞선 M2 태스크가 모두 반영된 상태에서 (1) 10만 항목 디렉터리의 목록 조회·정렬 시간을 macOS에서 측정하고 UI가 그리는 DOM 행 수와 함께 `docs/m2-benchmark.md`에 기록(측정 환경, 임계값 판정 문장 포함), (2) 키보드 전용 M2 종단 시나리오 `keyboard-scenario-m2.test.tsx`(Volumes/Go To Path로 이동 → 정렬 변경 → 그룹 선택 → 큐로 복사 → 일시정지/재개 → Actions Panel로 액션 실행 등), (3) `docs/m2-status.md`에 P1 ID 32개를 표로 정리(`done`+존재하는 테스트 경로, OS 부작용 fake 항목은 비고에 `fake만 검증`), docs/11 M2 완료 기준 대조.
- Non-goals: 성능 최적화(임계값 초과 시 원인만 기록), 새 기능.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `docs/m2-benchmark.md`에 ms 측정값 2개 이상과 DOM 행 수, 환경, 판정 문장. `keyboard-scenario-m2.test.tsx` 통과, 마우스 조작 0건. `docs/m2-status.md`에 32개 ID 행, `done`이면 테스트 경로가 실제 존재. 전체 `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과. 정지 조건 C1~C11 전부.

## Work slices
- [ ] S1. 벤치마크 측정과 `docs/m2-benchmark.md` — completion criterion: 파일에 측정값 존재
- [ ] S2. `keyboard-scenario-m2.test.tsx` — completion criterion: 통과, 마우스 0건 (depends: S1)
- [ ] S3. `docs/m2-status.md`와 docs/11 대조 — completion criterion: 32개 ID 행, 경로 존재 (depends: S2)
