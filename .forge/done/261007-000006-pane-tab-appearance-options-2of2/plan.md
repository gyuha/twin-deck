<!-- forge-slug: pane-tab-appearance-options-2of2 -->
<!-- task: 79 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 패널·탭 모양 옵션: 활성 패널 테두리 강조 끄기 · 탭 모양

## Goal / Non-goals
- Goal: 패널과 탭의 모양을 바꾸는 설정 2개를 추가한다. 모두 설정 화면의 "모양" 탭에 넣고, **기본값은 지금 모양과 같다.**
  - `behavior.layout.pane_highlight` (스위치, 기본 켜짐): 활성 패널을 감싸는 accent 테두리(`Pane.tsx`의 `border-accent`)를 보일지. 끄면 활성·비활성 패널 모두 테두리가 투명이다(패널 폭은 그대로라 레이아웃이 흔들리지 않는다). 활성 패널의 구분은 커서 행 표시로만 남는다.
  - `behavior.layout.tab_style` (선택, 기본 `underline`): `underline`(지금: 글자만 있고 활성 탭은 굵은 글씨 + 밑줄) / `segments`(Marta식: 탭이 폭을 똑같이 나눠 가지고 활성 탭은 배경이 밝아지며 밑줄이 없다). `segments`에서 탭이 많아 좁아지면 이름을 말줄임(`…`)으로 줄이고 가로 스크롤은 넣지 않는다. 새 색은 만들지 않고 기존 테마 변수를 쓴다. 허용값 밖이면 경고하고 `underline`으로 되돌린다.
- 출처: 이슈 #12의 스크린샷(Marta)과 요청 5개 중 "Tab 모양", "Panel highlight 끄기".
- Non-goals: 목록 쪽 4개 설정(1of2), 탭 모양 세 번째 스타일, 탭 폭 고정·가로 스크롤, 새 색·새 테마, 이슈 #12를 닫는 일(두 작업이 모두 끝난 뒤 사용자가 판단).

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #12
- 앞선 작업: `list-appearance-options-1of2`(같은 `default.toml`·`Settings.tsx`·`config.rs`를 건드리므로 이것이 먼저 봉인된 뒤 실행하는 것을 권한다. 소프트 순서이며 막지는 않는다).
- 설정 키 추가 절차(AGENTS.md): `td-config` 구조체 + `default.toml` → `task gen-types` → `ui/Settings.tsx` `SECTIONS` → 설정 탭 목록 테스트. `tab_style`은 `crates/td-config/src/load.rs`의 `ENUMS`에 등록한다.
- Definition of Done (착수 전 기준선은 1of2 봉인 직후의 값으로 다시 잡는다. 지금: `td-config` 24건, `up_to_date` 2건, `tsc` 0, vitest 84파일 732건):
  1. `cargo test -p td-config` 통과. 새 테스트: 기본값(`true`/`underline`), 사용자 설정 라운드트립, `tab_style`에 허용값 밖이면 경고하고 `underline`으로 되돌림. **구현 전에 실패(red)해야 한다.**
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과. `grep -c "pane_highlight\|tab_style" packages/ts-client/src/generated/bindings.ts` ≥ 2 (착수 전 0).
  3. `cd apps/desktop && bunx vitest run src/__tests__/pane-tab-appearance.test.tsx` 통과, `it(` 6개 이상(착수 전 파일 없음). 값으로 단언한다: (a) `pane_highlight` off이면 활성 패널의 테두리 클래스가 투명이고 on이면 accent이다, (b) off여도 패널의 `data-active` 속성은 그대로 따라간다(기능은 유지), (c) `tab_style=segments`이면 탭 줄의 각 탭이 같은 폭 클래스를 갖고 활성 탭에 밑줄 클래스가 없다, (d) `underline`이면 활성 탭에 밑줄 클래스가 있다, (e) 탭이 1개일 때도 두 모양 모두 깨지지 않는다, (f) 기본값에서는 패널·탭의 클래스가 지금과 같다(회귀 방지). (a)(c)는 구현 전에 실패(red)해야 한다.
  4. `settings.test.tsx` 통과와 설정 화면에 2개 항목이 있다는 단언 추가(착수 전 항목 없음).
  5. `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run --exclude '**/pdf-preview*'` 통과(회귀 방지: 사전 통과가 정상. 기존 `tabs`·`panes` 관련 테스트 포함).
  6. `docs/`에 2개 키가 적혔다: `grep -c "pane_highlight\|tab_style" docs/06-config-plugins.md` ≥ 2 (착수 전 0).

## Work slices
- [ ] S1. 실패하는 테스트 먼저: `td-config` 설정 테스트와 `pane-tab-appearance.test.tsx`(a)~(f)를 쓰고 red를 기록한다 — completion criterion: DoD 1·3의 red 상태
- [ ] S2. `td-config`: 구조체 2필드 + `default.toml` + `ENUMS` 등록, `task gen-types` — completion criterion: DoD 1, 2 (depends: S1)
- [ ] S3. `Pane.tsx`(테두리), `TabBar.tsx`(탭 모양)를 설정값으로 분기한다. 기본값의 클래스는 변하지 않는다 — completion criterion: DoD 3 green (depends: S2)
- [ ] S4. `Settings.tsx` "모양" 탭에 2개 항목, 설정 테스트, `docs/06-config-plugins.md` 갱신 — completion criterion: DoD 4, 6 (depends: S2)
