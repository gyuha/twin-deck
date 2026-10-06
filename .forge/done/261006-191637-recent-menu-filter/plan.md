<!-- forge-slug: recent-menu-filter -->
<!-- task: 73 -->
<!-- tdd: off -->
# 최근 위치 메뉴(Alt+3)에 입력 필터를 넣는다

## Goal / Non-goals
- Goal: 최근 위치 메뉴가 열린 상태에서 글자·숫자를 입력하면 입력한 문자열이 경로에 들어 있는(대소문자 무시, NFC 정규화) 항목만 목록에 남는다. ↑↓는 보이는 항목 사이를 움직이고, Return은 커서 항목으로 이동한다. 팝업 안에 현재 필터 문자열을 보여 준다. Backspace는 한 글자 지우고, Esc는 필터가 있으면 필터부터 비우고 없으면 메뉴를 닫는다. 일치 항목이 없으면 "일치하는 항목 없음"을 보여 준다.
- 키 충돌 정리(결정 사항): 글자·숫자 키는 모두 필터 입력이 된다. 기존 `C`(최근 위치 비우기)는 `Ctrl+Backspace`로, 숫자 1~0 바로 선택은 `Alt+숫자`로 옮긴다(보이는 항목 기준 n번째).
- Non-goals: 즐겨찾기·볼륨·상위 폴더 팝업(기존 키 그대로, 볼륨의 U/E 포함), 마우스 클릭 선택, 최근 위치의 탭 공통화·재시작 유지, 최근→즐겨찾기 지정, 퍼지(순서 건너뛰기) 매칭 — 부분 문자열 일치만 한다.

## Source of truth
- Glossary terms: none
- Related ADRs: `docs/adr/0007-action-registry.md`(액션·바인딩), `0010-cross-platform-keymap.md`
- 이슈 추적: GitHub 이슈 #16
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/recent-filter.test.tsx` 통과, `it(` 6개 이상. 테스트는 값을 단언한다: (a) 입력 후 보이는 옵션 목록이 정확히 일치 항목뿐, (b) 필터 후 ↓+Return이 그 항목 경로로 이동, (c) Backspace/Esc 동작(필터 → 메뉴 순서), (d) 일치 없음 문구, (e) `Alt+숫자`가 보이는 항목 기준으로 이동, (f) `Ctrl+Backspace`가 비우기, 그리고 `c` 입력은 필터로 들어가며 비우지 않는다.
  2. `menus.test.tsx`의 기존 최근 위치 테스트는 새 키(`Alt+숫자`, `Ctrl+Backspace`)로 갱신해 통과하고, 즐겨찾기·볼륨·상위 폴더 테스트는 수정 없이 통과한다(사전 통과가 정상인 회귀 방지 항목).
  3. 즐겨찾기 팝업에서는 글자·숫자 입력이 필터가 되지 않고 기존 숫자 선택이 그대로 동작한다 — 테스트로 증명.
  4. `cd packages/actions && bunx vitest run`, `cd apps/desktop && bunx tsc --noEmit` 통과.
  5. `grep -c "Ctrl+Backspace" docs/05-actions-keybindings.md` ≥ 1 (착수 전 0). 문서의 `core.recent.clear` 줄 키 칸이 "없음"이라 실제와 어긋나 있으므로 이번에 바로잡는다.
  6. 팝업 하단 안내 문구가 새 키를 반영한다 (`Ctrl+Backspace 비우기`, 입력=필터) — 테스트에서 문구 단언.

## Work slices
- [ ] S1. 메뉴 상태에 필터 문자열을 두고 최근 위치 목록을 걸러 보인다(커서는 보이는 항목 기준) — completion criterion: DoD 1 (a)(b)(d)
- [ ] S2. 최근 위치 메뉴에서 인쇄 가능한 글자를 필터로 받고 Backspace/Esc를 처리한다. 다른 팝업은 그대로 — completion criterion: DoD 1 (c), DoD 3 (depends: S1)
- [ ] S3. (macOS의 Option+숫자는 `e.key`가 특수문자라 `e.code`로 판별한다) 키 재배치: `core.recent.clear` → `Ctrl+Backspace`, 숫자 선택 → `Alt+숫자`(최근 위치 한정) — completion criterion: DoD 1 (e)(f), DoD 2, DoD 4 (depends: S2)
- [ ] S4. `PopupMenu.tsx`에 필터 표시와 안내 문구, 문서 갱신 — completion criterion: DoD 5, 6 (depends: S1)
