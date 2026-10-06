# 실행 기록 — 최근 위치 메뉴 입력 필터

## 슬라이스 결과
- S1 메뉴 상태에 필터와 전체 목록을 두고 최근 위치를 걸러 보임 — ✅ 계획대로 (`MenuState.all/filter`, `menuSetFilter`: NFC·소문자 부분 문자열, 커서는 첫 일치 항목)
- S2 글자·숫자·Backspace를 필터로 받고 Esc는 필터 우선 — ✅ 계획과 다르게 구현: 키 이벤트를 직접 받지 않고 팝업 안에 필터 `<input>`을 두었다(⚠ 한글 IME 조합 입력이 동작하도록). `useKeyboard`는 최근 위치 메뉴에서 글자·Backspace를 가로채지 않고 입력창에 넘긴다.
- S3 키 재배치 — ✅ `core.recent.clear` → `Ctrl+Backspace`, 숫자 선택 → `Alt+숫자`(`e.code`로 판별, 최근 위치 한정)
- S4 안내 문구·문서 — ✅ 팝업 하단 문구와 `docs/05-actions-keybindings.md`(메뉴 줄 설명, 비우기 키)

## DoD baseline → after
1. `recent-filter.test.tsx` 파일 없음 → 11개 `it(` 통과 (a)~(f) 모두 값 단언
2. `menus.test.tsx` 14 → 16건 모두 통과: 최근 위치 테스트 2건만 새 키로 고쳤고 나머지는 수정 없음
3. 즐겨찾기 팝업에 필터 입력창 없음, 숫자 `1`로 이동 — 통과
4. `packages/actions` vitest 19건, `tsc --noEmit` 종료 0
5. `grep -c "Ctrl+Backspace" docs/05-actions-keybindings.md` 0 → 1
6. 안내 문구 단언 — 통과

## 판단·발견
- 계획의 "`C`가 필터로 들어가고 비우지 않는다"는 `c·u·e` 입력 테스트로 증명했다. 볼륨 메뉴의 `U/E` 키 바인딩은 그대로이고, 최근 위치에서는 입력창이 먼저 받는다.
- 입력창 방식이라 키 가로채기 우선순위가 걸린다: 최근 위치 메뉴에서는 수식키 없는 글자·Backspace가 키맵을 건너뛴다. 이 메뉴에 단일 글자 단축키를 새로 걸면 먹히지 않는다.
- `docs/05`의 `core.recent.clear` 줄이 "없음"으로 실제와 어긋나 있었다(계획에서 예상) — 이번에 바로잡음.
- 전체 vitest(pdf-preview 제외) 81파일 713건 통과(기준선 80파일 700건).
