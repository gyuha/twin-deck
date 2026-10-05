<!-- forge-slug: layout-toggle-shortcuts -->
<!-- task: 58 -->
<!-- tdd: off -->
# Action Bar·Drive Bar 보기 토글에 단축키(Mod+Shift+A/D)를 달고 곳곳에 표시한다

## Goal / Non-goals
- Goal: `Mod+Shift+A`는 Action Bar, `Mod+Shift+D`는 Drive Bar 토글(`core.view.action_bar`, `core.view.drive_bar`). Help와 상태 줄 토글 버튼(툴팁·라벨)과 macOS 메뉴 막대 View 항목에 해당 키를 표시한다(`Mod`는 macOS에서 Cmd, 그 외 Ctrl). 메뉴 항목에는 네이티브 accelerator를 달지 않고 글자로만 표시한다(기존 `app-menu` 테스트의 "accelerator를 달지 않는다" 규칙 유지).
- Non-goals: 다른 액션의 키 변경, 메뉴 막대 구조 변경, 새 설정 키.
- 이슈 추적: GitHub 이슈 #6

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "보기 단축키"` → 통과 ≥ 1, 실패 0. 키 입력(Ctrl+Shift+A/D, mac은 Meta)으로 해당 바가 토글되는지, Help에 키가 나오는지, 상태 줄 버튼에 키가 표시되는지, 메뉴 항목 글자에 키가 들어가고 accelerator는 없는지 단언한다. 전진 검사.
  2. 기본 키맵에 중복·충돌이 없다(기존 키맵 충돌 테스트 통과) — 회귀 방지.
  3. `grep -c "core.view.action_bar" docs/05-actions-keybindings.md`와 `core.view.drive_bar`에 `Shift+A`/`Shift+D` 키가 적혀 있다(`grep -n "Shift+A" docs/05-actions-keybindings.md` ≥ 1, `Shift+D`도 ≥ 1). 전진 검사.
  4. `bunx tsc --noEmit` 통과.

## Work slices
- [ ] S1. `defaults.ts`에 키 바인딩을 추가하고 `docs/05`를 갱신한다 — completion criterion: DoD 1(키 입력 부분), 3
- [ ] S2. Help와 상태 줄 토글 버튼에 키를 표시한다 — completion criterion: DoD 1(표시 부분) (depends: S1)
- [ ] S3. `appMenu.ts`의 View 항목 글자에 플랫폼에 맞는 키를 붙인다 — completion criterion: DoD 1(메뉴 부분) (depends: S1)
