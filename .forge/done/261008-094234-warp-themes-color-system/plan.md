<!-- forge-slug: warp-themes-color-system -->
<!-- task: 107 -->
<!-- tdd: off -->
# 앱 색을 Warp 테마(apps/desktop/themes)로 바꾸고 기본을 Catppuccin으로 한다

## Goal / Non-goals
- Goal: 앱의 색(지금은 `@spacedrive/tokens`의 테마 7종)을 `apps/desktop/themes/*.yaml`의 Warp 테마 112개로 바꾼다. 원본 YAML은 빌드 때만 읽으므로 번들되는 `public/` 밖인 `apps/desktop/themes/`에 둔다(사용자 요청으로 `public/themes`에서 옮겼다). 결정한 것:
  - **설정은 `behavior.theme` 한 칸을 유지**한다. 값은 `system`·`light`·`dark`와 테마 파일 이름(`catppuccin-mocha`, `dracula-default` …) 112개다.
  - **기본 색은 Catppuccin**이다(사용자가 처음 Dracula라고 했다가 Catppuccin으로 바꿨다). `light` → `catppuccin-latte`, `dark` → `catppuccin-mocha`, `system` → OS가 다크면 Mocha, 아니면 Latte. 기본 설정값은 지금처럼 `system`이다.
  - **YAML은 빌드 때 변환**한다. 스크립트가 YAML을 읽어 TS 모듈과 Rust 상수를 생성하고(`task gen-types`에 묶고, 최신이 아니면 테스트가 실패), 앱은 실행 중에 YAML을 읽지 않는다.
  - **색 대응**: YAML의 `background`→`app`, `foreground`→`ink`, `accent`→`accent`(YAML 그대로, 사용자 확정), 터미널 normal의 `green`/`yellow`/`red`/`blue`→`status-success`/`-warning`/`-error`/`-info`. 표면 단계(`app-box`·`app-line`·`app-hover`·`app-selected`·메뉴·사이드바 등)는 배경에 글자색을 일정 비율 섞어 만든다. 흐린 글자(`ink-dull`·`ink-faint`)는 글자색을 배경 쪽으로 섞어 만들되, 모든 테마에서 `ink-faint`가 배경 대비 3.0 이상이 되도록 비율을 정한다(50% 혼합은 밝은 테마 31개가 3 미만이라 쓰지 않는다). 강조색 위 글자는 흰색/검정 중 대비가 큰 쪽이다. `color-scheme`은 YAML의 `details`(`darker`/`lighter`)를 따른다.
  - **옛 이름**(`midnight`·`noir`·`slate`·`nord`·`mocha`)은 없어진다. 설정에 남아 있으면 지금처럼 경고하고 `system`으로 돌아간다.
  - **설정 화면**의 테마 선택은 `system`·`light`·`dark`와 112개 테마 이름을 한 목록으로 보인다.
- 요청 경위: 사용자가 `apps/desktop/public/themes`에 테마 파일을 넣었다가(이후 "빌드 때 생성하면 `public`에 있을 필요가 없다"며 `apps/desktop/themes`로 옮기게 했다) "지금 디자인 시스템의 색상을 themes 색상으로 바꾸고, 기본 테마 색은 (light, dark, system) 선택 시 Dracula"로 요청 → grilling에서 Dracula(어두운 변형뿐)가 light와 맞지 않아 Catppuccin(Latte/Mocha)으로 바꿨다.
- Non-goals: 사용자가 넣는 YAML(앱 안에서 읽기), 테마별 글꼴, 터미널 16색 중 위 4색 외의 사용, 설정 화면의 테마 미리보기·그룹 제목, `behavior.text_color` 동작 변경, treemap 타일 색(`hsl` 고정)·코드 미리보기 외 색 체계 개편, 테마 재배포 라이선스 고지(아래 위험 참고), 실행 중 테마 전환 액션 신설.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 사전 확인(작성 시점):
  - `apps/desktop/themes`(옮긴 뒤)에 YAML 112개(어두움 80·밝음 32)가 있다(`README.md`는 없다). 형식: `name`·`accent`·`cursor`·`background`·`foreground`·`details`(`darker`/`lighter`)·`terminal_colors.{normal,bright}.{black,red,green,yellow,blue,magenta,cyan,white}`. 112개 모두 `details`와 실제 배경 밝기가 일치하고, 글자 대비는 solarized-light(4.1)만 4.5 미만이다. 옮기기 전 폴더의 README는 "Vite `public` 자산, `/themes/warp/<파일명>.yaml`로 읽는다"고 적었으나(경로도 틀렸다) 그 README는 지금 없다. 폴더가 `public/` 밖으로 나가 앱은 URL로 읽지 않는다.
  - 현재 색은 `index.css`가 `@spacedrive/tokens/theme`과 테마 7종 CSS를 불러오고, `App.tsx`의 `useTheme`이 `<html>`의 `data-theme`과 클래스(`dark`/`light`/`midnight-theme` …)를 정한다. `theme.css`가 `html.light { color-scheme: light }`를 둔다. spaceui 테마 하나는 `--color-*` 약 45개(`accent*`·`ink*`·`sidebar*`·`app*`·`menu*`·`status-*`)를 정의한다. 컴포넌트는 `bg-app`·`text-ink` 같은 이 토큰만 쓴다(`theme.test.tsx`의 가드가 Tailwind 기본 팔레트 사용을 막는다).
  - Rust는 `crates/td-config/src/load.rs`의 `ENUMS`에 `behavior.theme` 허용 값(`dark`·`light`·`midnight`·`noir`·`slate`·`nord`·`mocha`·`system`)을 고정하고, `crates/td-config/tests/config.rs`(`theme_setting_is_validated`·`theme_accepts_spaceui_themes`·`ENUMS`)가 같은 목록을 검증한다. 설정 화면은 `ui/Settings.tsx`의 `THEMES`(8개)를 선택 목록으로 쓴다.
  - `docs/06-config-plugins.md` 201행이 "spaceui 테마 7종 … 사용자 정의 테마 파일은 아직 없다"라고 적고 있다.
- Definition of Done (착수 전 기준선: `cd apps/desktop && bunx vitest run --exclude '**/pdf-preview*'` = 927건 통과 + `model-formats.test.ts` 1파일 로드 실패(jsdom에 canvas 없음, 기준선 잡음) · `cargo test -p td-config` 통과(29건) · `bunx tsc --noEmit` 0 — 아래 1~4는 아직 없는 파일이라 착수 전에는 실패하는 forward check이고, 5~6의 기존 테스트는 회귀 방지로 사전 통과가 정상이다):
  1. **생성**: `scripts/gen-themes.mjs`(의존성 추가 없이 YAML 파싱)가 `apps/desktop/themes/*.yaml`에서 `apps/desktop/src/lib/themes.generated.ts`(테마마다 `id`·`name`·`dark`·`background`·`foreground`·`accent`·`red`·`green`·`yellow`·`blue`)와 `crates/td-config/src/themes.rs`(`THEME_IDS: &[&str]`, 파일 이름 순)를 만든다. `task gen-types`가 이 스크립트도 실행한다. `bun test scripts/gen-themes.test.mjs`가 통과한다: 생성된 두 파일이 지금 YAML에서 다시 만든 결과와 같다(최신 아님 → 실패) · 항목이 112개이고 `id`가 파일 이름과 일치 · 예: `catppuccin-mocha`가 `background #1e1e2e`·`foreground #cdd6f4`·`accent #b4befe`·`dark true`이고 `catppuccin-latte`가 `dark false`.
  2. **색 계산**(순수 함수 `lib/themeColors.ts`의 `themeVars(theme)`)을 `__tests__/theme-colors.test.ts`가 단언한다: (a) spaceui `dark.css`가 정의하는 `--color-*` 이름이 **모두** 결과에 있다(빠진 토큰 없음) (b) Mocha에서 `--color-app`=`#1e1e2e`, `--color-ink`=`#cdd6f4`, `--color-accent`=`#b4befe`, `--color-status-error`가 YAML의 `normal.red` (c) 112개 모두에서 `ink`/`app` 대비 ≥ 4.0(solarized-light 4.1 허용)이고 `ink-faint`/`app` 대비 ≥ 3.0 (d) 112개 모두에서 강조색 위 글자색이 강조색과 대비 ≥ 4.5 (e) 같은 입력은 같은 결과.
  3. **적용**: `useTheme`이 `behavior.theme`을 풀어 `<html>`에 반영한다. `__tests__/theme.test.tsx`(옛 spaceui 테마 7종 케이스를 새 규칙으로 바꾼다)와 신규 케이스가 단언한다: `light`→`data-color-theme="catppuccin-latte"`·`dark`→`"catppuccin-mocha"`·`system`은 OS 다크면 Mocha, 아니면 Latte(OS 설정이 바뀌면 따라감, `matchMedia`가 없으면 Latte) · 테마 파일 이름(예: `dracula-default`)은 그 테마 · `<html>`에 `--color-app` 등이 인라인으로 걸리고 값이 해당 테마의 `themeVars`와 같다 · 테마를 바꾸면 이전 테마의 변수·클래스가 남지 않는다 · `data-theme`은 밝기(`dark`/`light`)이고 `color-scheme`이 `details`를 따른다 · 알 수 없는 값은 `system`처럼 동작한다.
  4. **검증(Rust)**: `crates/td-config`의 `behavior.theme`이 `system`·`light`·`dark`와 `THEME_IDS` 전부를 경고 없이 받고, 옛 이름(`midnight`·`noir`·`slate`·`nord`·`mocha`)과 `sakura` 같은 알 수 없는 값은 경고하고 `system`이 된다. `cargo test -p td-config`가 통과한다(`theme_accepts_spaceui_themes`는 새 허용 목록으로, `ENUMS` 검증 테스트도 새 목록으로 바뀐다). `default.toml`의 `theme = "system"`은 그대로다.
  5. **설정 화면·CSS**: `ui/Settings.tsx`의 테마 선택이 `system`·`light`·`dark`·112개 이름(총 115개)을 보이고(`__tests__`의 설정 테스트가 단언), `index.css`는 쓰지 않는 테마 CSS(`midnight`·`noir`·`slate`·`nord`·`mocha`)를 더 이상 불러오지 않는다(`dark`·`light`는 첫 그림 전 기본값으로 남김). `theme.test.tsx`의 토큰 가드(Tailwind 기본 팔레트 금지·`--td-surface` 금지·radix 변형)는 의미 변경 없이 통과한다.
  6. **문서·회귀**: `docs/06-config-plugins.md`의 테마 설명이 새 값·기본 매핑(light=Latte·dark=Mocha·system=OS)·옛 이름 폴백을 적고, `apps/desktop/themes/README.md`를 새로 둔다(옛 README는 폴더에서 이미 없어졌다): Warp YAML 112개의 출처(TerminalColors), "원본 데이터이고 빌드 때 `scripts/gen-themes.mjs`가 읽어 TS·Rust 상수를 만든다(앱에 번들되지 않는다)", 테마별 라이선스가 다를 수 있다는 경고를 적는다. 그리고 `apps/desktop/public/themes`가 더 이상 없다. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 `model-formats.test.ts` 외에 실패하는 파일이 없고, `cargo clippy -p td-config -- -D warnings`와 `cargo test -p twin-deck-desktop up_to_date`(바인딩·기본 설정 fixture가 최신)가 통과한다.

## Work slices
- [ ] S1. 생성 스크립트 `scripts/gen-themes.mjs`, 생성 파일 두 개, `task gen-types` 연결, `scripts/gen-themes.test.mjs` — completion criterion: DoD 1 green
- [ ] S2. `lib/themeColors.ts`(`themeVars`)와 `theme-colors.test.ts` — completion criterion: DoD 2 green (depends: S1)
- [ ] S3. `App.tsx`의 `useTheme` 교체, `index.css` 정리, `theme.test.tsx` 갱신 — completion criterion: DoD 3·5의 CSS 부분 green (depends: S2)
- [ ] S4. Rust `ENUMS`/`THEME_IDS` 검증과 `td-config` 테스트 갱신 — completion criterion: DoD 4 green (depends: S1)
- [ ] S5. `Settings.tsx` 선택 목록과 설정 테스트, 문서(`docs/06`·`apps/desktop/themes/README.md`) — completion criterion: DoD 5·6 green (depends: S3, S4)

## 위험·한계 (실행 전에 알려 둠)
- **라이선스**: 옮기기 전 README가 "테마별 원저작자·라이선스가 다를 수 있고 앱에 포함해 배포하기 전 확인·고지가 필요하다"고 적고 있었다. 폴더를 `public/` 밖으로 옮겨 YAML 파일 자체는 번들되지 않지만, 테마의 색(16진수 값)은 생성된 TS 모듈로 앱에 들어가므로 릴리스 전 확인은 여전히 필요하다. 이 계획은 라이선스를 확인하거나 고지문을 넣지 않는다.
- **눈으로 확인하지 못함**: 색이 실제로 보기 좋은지(특히 112개 중 어두운 쪽 대비가 낮은 테마의 표면 단계, solarized-light의 글자 대비 4.1)는 jsdom 테스트로 보증하지 못한다. 대비 수치와 토큰 완전성만 기계로 검사한다.
- **첫 그림 깜빡임**: 설정을 읽기 전에는 `dark`/`light`의 spaceui 기본값이 보이다가 설정이 로드되면 테마가 바뀐다(지금도 같은 구조). 이번 범위에서 없애지 않는다.
- 옛 이름 `mocha`(spaceui)는 새 `catppuccin-mocha`와 다른 이름이라, 설정에 `mocha`를 둔 사용자는 `system`으로 돌아간다.
