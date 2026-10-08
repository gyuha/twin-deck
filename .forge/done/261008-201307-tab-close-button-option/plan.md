<!-- forge-slug: tab-close-button-option -->
<!-- task: 110 -->
<!-- tdd: on -->
# 탭 닫기 버튼 옵션 — 켜면 마우스를 올린 탭 오른쪽에 ✕가 보이고 누르면 닫는다

## 목표 / 하지 않을 것
- 목표: 설정 `behavior.layout.tab_close_button`(기본 `false`)을 켜면, 마우스를 올린 탭의 **오른쪽에 ✕ 버튼**이 보이고 누르면 그 탭이 닫힌다. (GitHub 이슈 #36)
  - **켜짐일 때**: 모든 탭에 좌우 **대칭 패딩**(✕ 자리)을 항상 둔다(호버해도 글자가 움직이지 않고, `segments`에서도 글자가 가운데에 유지된다). 호버한 탭에만 ✕가 보인다. 패널에 **탭이 하나뿐이면 ✕를 숨긴다**(`closeTabAt`이 마지막 탭은 무시하므로 눌러도 반응 없는 버튼을 만들지 않는다). 패딩은 하나뿐일 때도 그대로다.
  - ✕ 클릭: 가운데 버튼 클릭과 같은 동작이다. 그 탭을 닫고(`closeTabAt`), **활성 패널은 바꾸지 않으며** 탭 끌기를 시작하지 않는다.
  - **꺼짐일 때**(기본): 탭 모양·패딩·동작이 지금과 완전히 같다. 가운데 클릭으로 닫는 동작은 켜짐·꺼짐 모두 유지한다.
  - 접근성: ✕는 `aria-label="탭 닫기: <탭 이름>"`, 탭처럼 `tabIndex -1`(키보드 대상 아님).
  - 호버는 CSS `:hover`가 아니라 "호버한 탭"을 상태(`onMouseEnter`/`onMouseLeave`)로 추적한다(jsdom의 `user.hover`로 시험할 수 있게).
  - 설정 화면의 "모양" 섹션에 스위치 항목으로 둔다.
- 하지 않을 것: 버튼 위치 선택(왼쪽/오른쪽) · 활성 탭에 ✕를 항상 보이는 모양 · 마지막 탭을 닫는 동작 변경 · 탭 닫기 키 동작 변경 · 탭 이름 말줄임·폭 계산 규칙의 변경(켜짐일 때 패딩만 추가)

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음 (새 용어를 만들지 않았다)
- 관련 ADR: 없음
- 관련 이슈: GitHub 이슈 #36
- 설정 키 체크리스트(AGENTS.md): `td-config` 구조체 + `default.toml` → `task gen-types`(바인딩·`default-config.json`) → 설정 화면 `SECTIONS` → 설정 탭 목록 테스트
- 갱신할 문서: `docs/06-config-plugins.md`(설정 키 목록의 `[behavior.layout]`), `docs/07-ui-spec.md`(탭 설명)
- 구현 메모: 탭 `<button role="tab">` 안에 `<button>`을 넣을 수 없으므로 탭과 ✕를 형제로 두는 래퍼를 쓴다. 기존 탭 모양 테스트(`pane-tab-appearance`)가 `role="tab"` 요소의 클래스(`flex-1`, `border-b-2`, `bg-app-selected` 등)를 직접 확인하므로 그 클래스는 탭에 그대로 둔다(꺼짐일 때의 DOM·클래스는 지금과 같게).
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/tab-close-button.test.tsx` 통과, 테스트 6건 이상 (사전 상태: 파일이 없어 실패 — 앞으로 가는 확인, TDD의 red). 새 테스트가 확인할 것:
     - 옵션 꺼짐(기본): ✕가 없고(`탭 닫기` 버튼 0개) 탭의 클래스가 지금과 같다(`px-2` 그대로).
     - 켜짐: 탭 둘 이상일 때 호버한 탭에만 `탭 닫기: <이름>` 버튼이 있고, 마우스를 다른 탭으로 옮기면 그 탭으로 옮겨 간다. 호버하지 않은 탭에는 없다.
     - 켜짐: 탭이 하나뿐이면 호버해도 ✕가 없다. 켜짐이면 하나뿐인 탭에도 패딩 클래스(대칭)는 있다.
     - 켜짐: ✕를 누르면 그 탭이 닫히고 활성 패널(`data-active`)은 그대로다. 다른 패널의 탭을 닫아도 활성 패널은 바뀌지 않는다.
     - 켜짐: ✕ 누름이 탭 끌기를 시작하지 않고, 탭 자체를 누르면 그 탭이 활성이 된다(기존 동작).
     - 켜짐·`segments`/`underline` 두 모양 모두 좌우 패딩이 같다.
  2. `cargo test -p td-config` 통과(`tab_close_button` 기본값 `false` 검증 포함) (사전 상태: 31건 통과, 새 검증이 없어 — 앞으로 가는 확인은 새 테스트 추가분)
  3. `cargo test -p twin-deck-desktop` 통과(`up_to_date`: 바인딩·`default-config.json`이 최신) (사전 상태: 통과 — 회귀 방지, `task gen-types` 후에도 통과해야 함)
  4. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 의 실패가 기준선 4건(`audio-preview` · `preview-scroll` PDF · `theme` · `theme-colors`)뿐이다. 설정 화면 항목 테스트(`settings.test.tsx`)와 탭 모양 테스트(`pane-tab-appearance`)는 통과해야 한다. (사전 상태: 같은 4건 — 회귀 방지)
  5. `cargo clippy -p td-config -- -D warnings` 와 `cargo clippy -p twin-deck-desktop -- -D warnings` 통과, `cargo fmt --check` 통과 (사전 상태: 통과 — 회귀 방지)
  6. `grep -c "tab_close_button" docs/06-config-plugins.md docs/07-ui-spec.md` 의 합이 2 이상이다(두 문서에 모두) (사전 상태: 0 — 앞으로 가는 확인)
  7. 실제 앱 확인(자동 테스트가 못 보는 부분): 설정의 "모양"에서 스위치를 켜고 탭에 마우스를 올리면 오른쪽에 ✕가 나타나고, 누르면 닫히며, 글자 위치가 호버로 움직이지 않는지, 두 탭 모양(`underline`·`segments`) 모두 보기에 어색하지 않은지 사람이 본다. CSS 색·위치는 jsdom이 못 본다.
- 이 DoD의 보증 범위: 1~6은 호버 상태 추적, ✕ 노출 규칙, 닫기 동작, 설정 키까지이고, "눈으로 보기에 ✕가 적절한 위치·크기·색인가"는 7번(사람)만 본다.

## 작업 조각
- [ ] S1. 실패하는 테스트 작성(red) — `apps/desktop/src/__tests__/tab-close-button.test.tsx`에 위 6가지를 쓰고 구현 전에 실패함을 확인한다. `td-config`에 `tab_close_button` 기본값 테스트도 쓴다. — 완료 기준: 구현 전 새 테스트가 모두 실패, 구현 후 모두 통과
- [ ] S2. 설정 키 — `td-config` `behavior.layout`에 `tab_close_button: bool`(기본 `false`)을 더하고 `default.toml`에 쓰고 `task gen-types`로 바인딩·`default-config.json`을 다시 만든다. (depends: S1) — 완료 기준: DoD 2·3이 통과한다
- [ ] S3. 탭 줄 — `TabBar`에 호버 상태 추적, 켜짐일 때 대칭 패딩과 ✕(오른쪽, 호버한 탭에만, 탭 하나뿐이면 숨김)를 구현한다. ✕ 누름은 가운데 클릭과 같이 활성 패널을 바꾸지 않고 끌기를 시작하지 않는다. 꺼짐일 때의 DOM·클래스는 그대로 둔다. (depends: S2) — 완료 기준: DoD 1이 통과하고 `pane-tab-appearance`가 그대로 통과한다
- [ ] S4. 설정 화면 — `Settings.tsx`의 `SECTIONS`(모양)에 `behavior.layout.tab_close_button` 스위치 항목(제목 "탭 닫기 버튼")을 더하고 설정 항목 테스트를 갱신한다. (depends: S2) — 완료 기준: `settings.test.tsx`가 새 항목을 확인하며 통과한다
- [ ] S5. 문서 — `docs/06-config-plugins.md`와 `docs/07-ui-spec.md`를 고친다. — 완료 기준: DoD 6이 통과한다
