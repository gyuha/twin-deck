<!-- forge-slug: ui-file-ops-scenario -->
<!-- task: 8 -->
<!-- priority: medium -->
<!-- tdd: off -->
# UI: 파일 작업 액션, 대화상자, 키보드 시나리오, M1 상태 문서

## Goal / Non-goals
- Goal: OP-01~07 액션(새 폴더/새 파일/복사/이동/이름 변경/휴지통/영구 삭제)을 UI에 연결하고, 키보드로 조작되는 다이얼로그(이름 입력, 삭제 확인, 이름 충돌 덮어쓰기/건너뛰기/이름 바꿈)를 만들고, 키보드 전용 종단 시나리오 테스트와 `docs/m1-status.md`를 완성한다. 파일 변경 이벤트로 목록이 갱신된다.
- Non-goals: 큐 UI/진행률, 일시정지/중단, 드래그 앤 드롭.

## Source of truth
- Glossary terms: 활성/비활성 패널
- Related ADRs: docs/adr/0007
- Definition of Done: `apps/desktop/src/__tests__/keyboard-scenario.test.tsx`가 존재·통과하고 마우스 조작(`.click(`, `fireEvent.click/mouse`, `userEvent.pointer/hover/dblClick`)이 0건. 시나리오: 폴더 진입 → 파일 선택 → F5로 비활성 패널로 복사 → F6 이동 → Shift+F6 이름 변경 → F8 삭제(휴지통) → 최종 fake 백엔드 상태 단언. 충돌 다이얼로그가 키보드(방향키/Enter 또는 단축 문자)로 3가지 선택 처리. 다이얼로그 열림 시 스코프가 dialog로 바뀌어 패널 키가 무시됨. 감시 이벤트 수신 시 목록 갱신 테스트. `docs/m1-status.md`에 P0 ID 18개(PANE-01 PANE-02 PANE-04 NAV-01 NAV-03 NAV-12 SEL-01 SEL-02 SEL-05 OP-01 OP-02 OP-03 OP-04 OP-05 OP-06 OP-07 OP-17 ACT-02)가 표 행으로 있고 각 행은 `done`+존재하는 테스트 파일 경로 또는 `not-done`+사유. 최종 `bun run typecheck && bun run test && bun run build`와 `cargo test --workspace`가 통과.

## Work slices
- [ ] S1. 파일 작업 액션 핸들러(OP-01~07)와 이름 입력/삭제 확인 다이얼로그 — completion criterion: 컴포넌트 테스트 통과
- [ ] S2. 충돌 다이얼로그 3종 선택 + 백엔드 충돌 정책 연결 — completion criterion: 테스트 통과 (depends: S1)
- [ ] S3. 감시 이벤트로 목록 갱신 — completion criterion: 이벤트 주입 시 목록이 갱신되는 테스트 통과 (depends: S1)
- [ ] S4. `keyboard-scenario.test.tsx` 종단 시나리오 — completion criterion: 테스트 통과, 마우스 조작 0건 (depends: S1, S2)
- [ ] S5. `docs/m1-status.md` 작성과 docs/11-roadmap.md의 M0/M1 완료 기준 대조 결과 기록 — completion criterion: 18개 ID 행 존재, done 행의 테스트 경로가 실제 존재 (depends: S4)
