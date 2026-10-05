<!-- forge-slug: multi-rename-key-display -->
<!-- task: 59 -->
<!-- tdd: off -->
# 다중 이름 바꾸기 단축키(Mod+Shift+R)를 Help와 File 메뉴에 정확히 표시한다

## Goal / Non-goals
- Goal: 다중 이름 바꾸기의 현재 키는 `Mod+Shift+R`이다(이미 그렇다). Help에 이 키가 정확히 나오고, File 메뉴(macOS 메뉴 막대)의 "다중 이름 바꾸기" 항목 글자에 키가 표시되게 한다. 이슈의 `Mod+Shift+F`는 이미 빠른 선택 시작 키라 바꾸지 않는다(사용자 결정).
- Non-goals: 다중 이름 바꾸기 키 변경, 빠른 선택 시작 키 변경.
- 이슈 추적: GitHub 이슈 #7

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "다중 이름 바꾸기 단축키"` → 통과 ≥ 1, 실패 0. Help의 해당 행에 `Ctrl+Shift+R`(mac은 `Cmd+Shift+R`)이 나오고, File 메뉴 항목 글자에 키가 있고 accelerator는 없으며, `Mod+Shift+F`가 여전히 빠른 선택 시작인지 단언한다. 전진 검사.
  2. `bunx tsc --noEmit` 통과.

## Work slices
- [ ] S1. Help 표기를 확인하고 틀리면 고친다, File 메뉴 항목 글자에 키를 붙인다 — completion criterion: DoD 1
