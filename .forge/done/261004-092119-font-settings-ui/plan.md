<!-- forge-slug: font-settings-ui -->
<!-- task: 44 -->
<!-- part: 2/2 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# UI 글꼴·미리보기 글꼴을 화면에 적용하고 설정 화면에 입력칸 추가

## Goal / Non-goals
- Goal: 설정 `behavior.ui_font`를 앱 전체 UI(목록, 대화상자, 메뉴 등)에, `behavior.preview_font`를 텍스트·코드·JSON·Markdown 미리보기 본문에 각각 적용한다. 설정 화면의 "모양" 섹션에 "UI 글꼴"과 "미리보기 글꼴" 텍스트 입력칸을 두고, 바꾸면 즉시 반영되고 저장된다. 비우면 기본 글꼴이다.
- Non-goals: 글꼴 크기, 설치된 글꼴 목록 선택, 코드 하이라이트 색, 백엔드 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `apps/desktop/src/__tests__/fonts.test.tsx`(새 파일, 테스트 3개 이상)가 통과한다. (a) ui_font 지정 시 UI 요소에만, (b) preview_font 지정 시 미리보기 본문에만 적용, (c) 비우면 기본으로 복귀, 그리고 설정 화면 입력칸 두 개를 바꾸면 FakeBackend 설정이 갱신되고 즉시 반영된다. `bunx tsc --noEmit`, 전체 vitest(기존 `pdf-preview` 1건 제외), `cargo test --workspace`, fmt, clippy가 통과한다.

## Work slices
- [ ] S1. 설정 값을 CSS로 적용한다: UI 글꼴은 앱 루트(`html`/`body`)의 `font-family`로, 미리보기 글꼴은 `Preview`·`CodeView`·`MarkdownView`·`JsonView` 본문 영역으로 적용하고 비어 있으면 아무것도 덮어쓰지 않는다. 설정이 바뀌면 `App.tsx`의 `useTheme`처럼 즉시 반영한다 — completion criterion: fonts.test.tsx의 (a)(b)(c)가 통과한다
- [ ] S2. 설정 화면 "모양" 섹션에 `behavior.ui_font`, `behavior.preview_font` 텍스트 입력칸("UI 글꼴", "미리보기 글꼴")을 추가한다 — completion criterion: fonts.test.tsx가 입력칸을 찾아 값을 바꾸면 FakeBackend 설정이 갱신되고 화면에 반영됨을 단언해 통과한다 (depends: S1)
