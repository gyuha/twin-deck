<!-- forge-slug: app-menu-settings-entry -->
<!-- task: 117 -->
<!-- tdd: on -->
# 메뉴바와 상태 표시줄에 설정·단축키 목록을 열 자리를 만든다 (이슈 #40)

## 목표 / 하지 않을 것
- 목표: 설정(`core.settings.open`)과 단축키 목록(`core.help`, F1 도움말 화면)이 지금은 단축키·F1 버튼·액션 패널로만 열린다. 눈에 보이는 진입점을 둘 더한다.
  - **macOS 메뉴바**: 기존 `appMenu.ts`가 만드는 메뉴(Tauri 기본 메뉴 + 한글 File 항목 + View 토글)에 `설정…`을 앱 메뉴("Twin Deck")에, `단축키 목록`을 Help 메뉴에 넣는다. 항목 글자 뒤에 현재 키를 괄호로 붙인다(`설정… (Cmd+,)`). 이 방식은 기존 `withKey`와 같고, 네이티브 accelerator는 달지 않는다(앱이 키를 직접 처리하므로 이중 실행·열린 창 위 실행을 피한다). 사용자가 `keybindings.toml`로 바꾼 키도 `keymap.keysFor`로 반영된다.
  - **모든 OS의 상태 표시줄**: 오른쪽 끝 보기 토글(숨김 파일·Drive Bar·Action Bar) 줄에 `단축키`와 `설정` 버튼을 더한다. 메뉴바가 없는 Windows·Linux의 진입점이고, 이미 모든 OS에 보이는 토글 줄(task #55)을 따라 macOS에서도 보인다. 버튼의 `title`에 현재 키를 보여 준다(`viewToggle`과 같은 방식).
  - 메뉴 항목은 열려 있는 창·메뉴가 있으면(`scopeStack()[0] !== "pane"`) 실행하지 않는다(기존 File 항목과 같다). 버튼은 설정이 이미 열려 있으면 닫지 않고 그대로 둔다(`openSettings`의 기존 동작을 따른다).
- 하지 않을 것
  - Windows 창 메뉴바(Alt 키 충돌·세로 공간)와 Linux 별도 처리
  - 메뉴 전체의 한글화(기존 영어 제목 File·View·Help와 About·Quit은 그대로, 새 항목만 한글), Edit·Window 같은 기본 메뉴 항목
  - 네이티브 accelerator 등록, 액션을 더 만들거나 키를 바꾸는 일(기존 `core.settings.open`·`core.help`만 쓴다)
  - 전체 액션 메뉴(파일·편집·보기·이동 등)

## 기준 문서
- 용어: 새 용어 없음 (`설정 화면`은 `.forge/CONTEXT.md`에 이미 있다)
- 관련 ADR: 없음. 되돌리기 쉬운 UI 추가이고 ADR 기준 셋을 채우지 못한다.
- 갱신할 문서: `docs/07-ui-spec.md`(상태 표시줄 버튼), 메뉴바를 설명하는 문서가 있으면 그곳(`grep -n 'View 메뉴\|File 메뉴' docs/*.md`로 착수할 때 찾는다)
- 선행 맥락: `appMenu.ts`와 `app-menu.test.ts`(task #58·#59), 상태 표시줄 토글 `StatusBar`(task #55), `useKeyboard`의 키 처리
- 착수 때 확인할 점: 앱 메뉴의 첫 항목 이름은 `renameAppMenu`가 `Twin Deck`으로 바꾸고, 기본 메뉴에서 "Settings…" 같은 항목이 이미 있는지는 이 맥에서 눈으로 본 적이 없다(Tauri 기본 앱 메뉴는 About·Services·Hide·Quit). 설정을 넣을 위치(About 바로 아래 구분선 뒤)는 실제 앱에서 사람이 확인한다.
- 완료 정의(DoD). 작성 시 기준선: `tsc` 통과, `app-menu.test.ts` 14건 통과, 상태 표시줄에 설정·단축키 버튼 없음.
  1. `app-menu.test.ts`에 (a) 앱 메뉴에 `설정…`이 있고 그 글자가 현재 키를 괄호로 단 형태다(`keyOf` 값이 바뀌면 글자도 바뀐다) (b) Help 메뉴에 `단축키 목록`이 있다 (c) 두 항목을 누르면 `core.settings.open`·`core.help`가 실행된다 (d) 기존 14건은 그대로 통과한다. 새 단언은 구현 전에 먼저 red여야 한다.
  2. 새 `app-status-buttons.test.tsx`(vitest, `renderApp`)가 통과한다: 상태 표시줄에 `설정`·`단축키` 버튼이 보이고(`linux`와 `mac` 모두), 누르면 설정 화면·도움말 화면이 열리며, 버튼의 `title`에 키가 보인다. 사전 상태: 파일이 없어 실패(앞으로 가는 확인).
  3. 회귀 방지(사전에 통과하는 것이 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run`에서 실패 파일이 기준선(`model-formats`, `pdf-preview`, 착수 때 다시 잰다) 밖으로 늘지 않는다.
  4. 문서: `grep -c '설정' docs/07-ui-spec.md`의 상태 표시줄 버튼 설명이 늘었다(사전 상태 0 → 1 이상, 앞으로 가는 확인).
  5. 실제 앱 확인(사람, jsdom은 네이티브 메뉴를 볼 수 없다): macOS 메뉴바에서 `Twin Deck` 메뉴의 `설정…`과 Help의 `단축키 목록`이 보이고 눌러서 열린다, 키가 현재 바인딩과 같다, 열려 있는 창 위에서는 실행되지 않는다. Windows는 상태 표시줄 버튼이 보이고 열린다(Windows 기기 확인).

## 작업 조각
- [ ] S1. `appMenu.ts`에 설정·단축키 목록 항목 추가(+ 먼저 `app-menu.test.ts` red) — 완료 기준: DoD 1이 green이다
- [ ] S2. `App.tsx` `StatusBar`에 `설정`·`단축키` 버튼 추가(+ 먼저 `app-status-buttons.test.tsx` red) — 완료 기준: DoD 2가 green이다
- [ ] S3. 문서 갱신(`docs/07-ui-spec.md`와 메뉴바 설명 문서)과 전체 회귀 확인 — 완료 기준: DoD 3·4가 통과하고, DoD 5의 확인 항목이 run.md에 적혀 있다 (depends: S1, S2)
