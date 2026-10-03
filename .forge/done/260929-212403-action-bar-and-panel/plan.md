<!-- forge-slug: action-bar-and-panel -->
<!-- task: 30 -->
<!-- priority: medium -->
<!-- tdd: off -->
# Action Bar와 Actions Panel, 액션 인수

## Goal / Non-goals
- Goal: PANE-07, ACT-01, ACT-03. 하단 Action Bar(`F4 편집 F5 복사 F6 이동 F7 새 폴더 F8 휴지통 Shift+F8 삭제`, 현재 플랫폼 키 표기, `layout.show_action_bar` 설정으로 끄기, 비활성 액션은 비활성 표시), Actions Panel(`Mod+Shift+P`, 액션 이름 퍼지 검색, 방향키/Return 실행, 비활성 액션은 흐리게 실행 불가, `Alt`를 누르는 동안 액션 ID 표시, 마지막 검색어는 이후 복원 태스크에서 저장), 바인딩의 액션 인수(예: `Alt+H`로 `core.open.directory` `src="~"`)를 설정에서 받아 실행.
- Non-goals: 사용자 정의 액션(Gadget), 플러그인 액션.

## Source of truth
- Glossary terms: 액션
- Related ADRs: docs/adr/0007
- Definition of Done: `action-bar.test.tsx`(구성, 키 표기가 macOS/Linux에서 다름, 설정으로 숨김, 비활성 표시) 및 `actions-panel.test.tsx`(열기/퍼지 검색 결과 순서/실행/비활성 실행 불가/Alt로 ID 표시/Esc 닫기, 인수가 있는 바인딩이 `core.open.directory`로 이동) 통과. 모두 키보드. `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. 인수를 받는 액션 실행 경로(`core.open.directory`, 설정 인수 병합) — completion criterion: 단위 테스트 통과
- [ ] S2. Action Bar — completion criterion: action-bar.test.tsx 통과
- [ ] S3. Actions Panel — completion criterion: actions-panel.test.tsx 통과 (depends: S1)
