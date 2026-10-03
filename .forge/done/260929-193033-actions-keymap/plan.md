<!-- forge-slug: actions-keymap -->
<!-- task: 19 -->
<!-- priority: high -->
<!-- tdd: off -->
# 액션 레지스트리, 컨텍스트 조건, 기본 키맵

## Goal / Non-goals
- Goal: docs/05-actions-keybindings.md, ADR-0007, ADR-0010대로 `packages/actions`(`@twin-deck/actions`)와 `packages/keybinds`(`@twin-deck/keybinds`, 자체 구현)를 만든다. 단일 액션 레지스트리(ID, 이름, `isApplicable` 컨텍스트 조건), 키 문자열 파싱/정규화(Cmd→Ctrl, Opt→Alt 플랫폼 매핑), 스코프 해석, M1 기본 키맵(F5 복사, F6 이동, Shift+F6 이름변경, F7 새 폴더, Shift+F7 새 파일, F8 휴지통, Shift+F8 영구 삭제, Tab 패널 전환, Cmd/Ctrl+T 새 탭, Cmd/Ctrl+W 탭 닫기, Alt+Cmd/Ctrl+←/→ 탭 이동, Esc 선택 해제, Cmd/Ctrl+Shift+. 숨김 토글 등)을 구현한다.
- Non-goals: TOML 사용자 키맵 로더(M2), Action Bar/Actions Panel UI(M2), 플러그인.

## Source of truth
- Glossary terms: 액션, Gadget(제외)
- Related ADRs: docs/adr/0007, 0010
- Definition of Done: `bun run test`에서 이 패키지들의 vitest가 통과. ACT-02: 컨텍스트 조건에 따라 액션이 활성/비활성(예: 선택 없으면 복사 비활성)임을 검증하는 테스트. 키 매핑: macOS와 Windows/Linux 플랫폼 파라미터 별로 같은 논리 키가 다른 물리 조합으로 해석됨을 검증하는 테스트. 같은 키가 스코프(panel/dialog)에 따라 다른 액션으로 해석되는 테스트. 중복 액션 ID 등록은 오류.

## Work slices
- [ ] S1. `@twin-deck/keybinds`: 키 조합 파서/정규화/플랫폼 매핑/스코프 해석 — completion criterion: vitest 통과 (macOS vs Linux 매핑 케이스 포함)
- [ ] S2. `@twin-deck/actions`: 레지스트리, `isApplicable(context)`, 디스패치 — completion criterion: vitest 통과 (ACT-02 케이스 포함) (depends: S1)
- [ ] S3. M1 기본 액션 ID 목록과 기본 키맵 데이터 — completion criterion: 모든 기본 바인딩이 등록된 액션 ID를 가리키는지 검증하는 테스트 통과 (depends: S2)
