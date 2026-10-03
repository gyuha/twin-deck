<!-- forge-slug: state-restore-and-windows -->
<!-- task: 32 -->
<!-- priority: low -->
<!-- tdd: off -->
# 재시작 상태 복원과 다중 창

## Goal / Non-goals
- Goal: PANE-05, PANE-03. 탭·경로·커서·선택·Actions Panel 검색어·활성 패널·숨김 표시를 상태 스냅샷(JSON, 앱 데이터 디렉터리, 원자적 쓰기)으로 저장/복원하고(`state_snapshot_roundtrip`), 존재하지 않는 경로는 가장 가까운 상위로 대체, `core.state.reset`(상태 초기화) 액션 제공. 다중 창: `core.window.new`(`Mod+N`)가 새 창을 열고 창별 상태를 분리한다(창 레이블 생성, 스냅샷은 창별).
- Non-goals: 터미널 높이 복원(M3), 창 크기/위치 복원, 창 간 탭 이동.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0004
- Definition of Done: 이름 지정 Rust 테스트 `state_snapshot_roundtrip`(저장→로드 동일, 깨진 파일은 기본 상태로 폴백하고 경고, 원자적 쓰기) 통과. `restore-state.test.tsx`(스냅샷에서 탭/경로/커서/선택 복원, 사라진 경로 대체, 초기화 액션) 통과. 새 창 command는 창 생성 trait fake로 호출 검증(실제 창은 만들지 않음 — 상태 문서에 `fake만 검증` 기록). `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. 스냅샷 모델/저장/로드/원자적 쓰기(Rust) — completion criterion: `state_snapshot_roundtrip` 통과
- [ ] S2. UI 복원과 초기화 액션 — completion criterion: restore-state.test.tsx 통과 (depends: S1)
- [ ] S3. 새 창 command와 창별 스냅샷 키 — completion criterion: 단위 테스트 통과 (depends: S1)
