<!-- forge-slug: ui-panes-navigation -->
<!-- task: 7 -->
<!-- priority: medium -->
<!-- tdd: off -->
# UI: 듀얼 패널, 탭, 목록 탐색과 선택

## Goal / Non-goals
- Goal: docs/07-ui-spec.md대로 듀얼 패널(활성 패널 시각 구분, Tab 전환), 패널별 탭(위치/정렬/선택/이력 각자 보유), 파일 테이블(커서, 방향키/Home/End/PageUp/PageDown), 열기/상위 이동(Enter/Backspace), 브레드크럼, 선택(Space/삽입 선택, 전체 선택, Esc 해제, Shift+이동 범위 반전), Quick Select(접두 입력 이동, 한글 NFD 정규화), 숨김 파일 토글(OP-17)을 React + zustand로 구현한다. 모든 조작은 액션 레지스트리를 경유한다. 목록 데이터는 ts-client 백엔드 포트로 받는다.
- Non-goals: 다중 컬럼, 컬럼 설정, 미리보기, 드래그 앤 드롭, 재시작 복원, Action Bar/Actions Panel.

## Source of truth
- Glossary terms: 패널, 활성/비활성 패널, 탭, Quick Select
- Related ADRs: docs/adr/0007
- Definition of Done: `bun run typecheck && bun run test && bun run build` 통과. 컴포넌트/스토어 vitest가 PANE-01(Tab 전환), PANE-02(패널별 독립 탭 상태), PANE-04(새 탭/닫기/이동 액션), NAV-01, NAV-03, NAV-12, SEL-01, SEL-02, SEL-05, OP-17을 각각 검증. 테스트는 마우스 없이 키보드 이벤트로 수행. 테스트에 ID가 주석/`describe` 이름으로 표기되어 `docs/m1-status.md`가 참조 가능.

## Work slices
- [ ] S1. 스토어(zustand): 패널/탭/커서/선택/이력, 액션 컨텍스트 산출 — completion criterion: 스토어 단위 테스트 통과 (PANE-01, 02, 04)
- [ ] S2. FileTable + 키보드 이동/열기/상위/브레드크럼 — completion criterion: 컴포넌트 테스트 통과 (NAV-01, 03, 12) (depends: S1)
- [ ] S3. 선택 모델: 전체/해제/Shift 반전, Quick Select(NFD 한글) — completion criterion: 테스트 통과 (SEL-01, 02, 05) (depends: S1)
- [ ] S4. 숨김 파일 토글 액션과 표시 반영 — completion criterion: 테스트 통과 (OP-17) (depends: S2)
- [ ] S5. App 조립: 패널+탭바+키 이벤트를 keybinds/actions에 연결 — completion criterion: `bun run build` 통과, 렌더 스모크 테스트 통과 (depends: S2, S3)
