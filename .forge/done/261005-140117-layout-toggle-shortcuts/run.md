# run — Action Bar·Drive Bar 보기 토글에 단축키(Mod+Shift+A/D)를 달고 곳곳에 표시한다

워크플로우 없이 직접 실행했다. 테스트 5개를 먼저 써서 모두 빨간 상태임을 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 `defaults.ts`에 `Mod+Shift+D`(드라이브 바), `Mod+Shift+A`(Action Bar) 추가, `docs/05`에 행 두 개 추가 — ✅ 계획대로
- S2 Help와 상태 줄 토글 버튼에 키 표시 — ✅ Help는 키맵에서 자동으로 나와 코드 변경이 없었고, 상태 줄 버튼은 `title`에 `(Ctrl+Shift+A)` 형태로 표시했다
- S3 macOS View 메뉴 항목 글자에 키를 붙임 — ✅ `installFileMenu`/`installFileMenuForWindow`에 선택 인자 `keyOf`를 추가했다. 주지 않으면 이전과 같다

## 계획과 달라진 점
- 메뉴 항목의 글자 형식은 `드라이브 바 표시 (Cmd+Shift+D)`다. 네이티브 accelerator를 달지 않는 기존 규칙(앱이 키를 직접 처리한다)을 지키려고 글자로만 표시했다. 네이티브 메뉴는 오른쪽 정렬 키 열을 글자로 만들 수 없어 괄호로 붙였다.
- 상태 줄 버튼은 화면 모양을 바꾸지 않으려고 보이는 글자는 그대로 두고 툴팁(`title`)에만 키를 넣었다.
- 숨김 파일 토글(`core.view.hidden`) 툴팁에도 같은 방식으로 키가 붙는다(앞선 작업과의 일관성).
- 메뉴 설치 효과의 의존성에 `keymap`을 추가했다(사용자 키맵이 바뀌면 메뉴 글자도 다시 만들어진다).

## DoD baseline → after
1. `vitest -t "보기 단축키"` — 0 tests → 5 passed (구현 전 5 failed)
2. 키맵 충돌 — 전체 vitest 통과(`Mod+Shift+A/D`는 기존 바인딩과 겹치지 않음)
3. `grep -c "Shift+A" docs/05-actions-keybindings.md` — 0 → 1, `Shift+D` — 0 → 1
4. `tsc` 통과, 전체 vitest 624 통과 / 1 실패(`pdf-preview` 기준선), `up_to_date` 통과

## 남은 불확실성
- 실제 macOS 메뉴 막대에서 `드라이브 바 표시 (Cmd+Shift+D)` 글자가 어떻게 보이는지는 jsdom 테스트로 확인할 수 없다(사용자 몫).
