# RUN — action-bar-and-panel
- S1 액션 인수 — ✅ `mergeUserBindings`/`Keymap.resolveBinding`/`dispatch(args)` 경로(td-config 태스크)에 더해 `core.open.directory`(인수 `src`, `~`·`${user.*}` 확장, 없는 경로/인수 누락은 알림) 구현. Go To Path와 같은 `navigateToPath`를 공유. ACT-03 예시(`Alt+H` → `core.open.directory src="~"`)를 테스트.
- S2 Action Bar (PANE-07) — ✅ `layout.action_bar` 구성, 현재 키맵에서 키를 역조회(`Keymap.keysFor`), 플랫폼별 표기(`formatKey`: Cmd/Opt vs Ctrl/Alt), `behavior.layout.show_action_bar`로 끔(설정 변경 즉시 반영), 실행 불가 액션은 `aria-disabled`+흐림, 알 수 없는 ID는 무시하고 경고, 클릭(보조 수단)으로 실행.
- S3 Actions Panel (ACT-01) — ✅ `Mod+Shift+P`, 새 모달 스코프 `palette`(입력창에 글자가 그대로 들어가야 해서 메뉴용 `panel`과 분리), 퍼지 검색(제목·ID·분류), ↑↓/Enter/Esc, 실행 불가 액션은 흐리게 보이고 실행되지 않으며 패널도 닫히지 않음, Alt를 누르는 동안 액션 ID 표시(keydown/keyup), 마지막 검색어를 다시 열 때 이어서 보여 주고 선택 상태로 열어 바로 덮어쓸 수 있음(`lastPaletteQuery` — 재시작 복원은 state-restore 태스크에서 저장).
- 테스트가 잡은 설계 문제 2건: (1) 탐욕적 부분 수열 매칭이 `core.copy`에서 `core`의 `c`를 먼저 잡아 연속 일치를 놓쳐 `copy` 검색 1등이 `core.path.copy_files`였음 → 연속 부분 문자열 일치를 우선하고(맨 앞/단어 시작 가산), 없으면 부분 수열로 폴백. (2) 액션에 키가 둘(기본+사용자)일 때 첫 키만 보여 사용자 바인딩이 안 보임 → 패널은 모든 키를 `F6 · F5`로 표시(Action Bar는 첫 키).
⚠ 한계: 패널은 상위 50개만 그림. 패널 안 마우스 조작 없음. `shortTitle`은 Action Bar 기본 6개만 정의.
⚠ 미검증: 실제 웹뷰에서 Alt 키 keydown/keyup(특히 macOS Option, Linux 데스크톱의 Alt 가로채기) 동작.
DoD: keybinds 15, actions 19, ts-client 40, desktop vitest 154(action-bar 8, actions-panel 14, lib 26).
