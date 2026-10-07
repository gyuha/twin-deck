<!-- forge-slug: text-brightness -->
<!-- task: 87 -->
<!-- tdd: off -->
# 글자 밝기 설정(`behavior.text_brightness`)을 추가한다

## Goal / Non-goals
- Goal: 어두운 테마에서 글자가 너무 밝다는 요청(이슈 #23)에 맞춰, 앱 글자의 밝기를 낮추는 설정 하나를 둔다. `behavior.text_brightness`(정수 %, 50~100, 기본 100 = 지금과 같음). 테마의 글자색(`--color-ink`, `--color-ink-dull`, `--color-ink-faint`)을 배경색(`--color-app`) 쪽으로 `100 − 값`% 섞어서, 모든 테마(밝은 테마 포함)에서 같은 방식으로 작동한다. 설정 화면에서 숫자(`int`)로 고치고, 바꾸면 곧바로 화면에 반영된다. 범위 밖 값은 화면에 쓸 때 50~100으로 보정한다.
- 요청 경위: GitHub 이슈 #23 "Font 컬러 지정 기능 요청" — 테마에 종속이면 font 밝기라도 조절할 수 있으면 좋겠다, Dark theme에서 텍스트가 너무 밝게 표시된다.
- Non-goals: 글자색을 직접 고르는 기능(색 선택·테마별 재정의), 배경·강조색 변경, 미리보기 본문(코드 강조 `hljs`) 색 변경, 새 액션·기본 키 추가, 테마 추가.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #23
- 사전 확인(작성 시점): 설정은 `crates/td-config/src/config.rs`의 `Behavior`(`theme`, `ui_font`, `preview_font` …)와 `default.toml`이 정의하고, 정수 설정은 `Settings.tsx` `SECTIONS`의 `control: { type: "int" }`로 보인다(예: `behavior.table.icon_size`). 글꼴은 `ui/fonts.ts`의 `useUiFont`가 `document.body.style`에 반영한다. 테마는 `App.tsx`의 `useTheme`가 `<html>` 클래스를 바꾸고 색 변수는 `@spacedrive/tokens`가 클래스별로 정의한다(`theme.css` 주석). 글자색은 `var(--color-ink)` 계열이다. **변수를 자기 자신으로 덮어쓰면 순환하므로**, 테마가 정한 원래 값을 `getComputedStyle(document.documentElement)`로 읽어 `body`에 `color-mix(in srgb, <원래 값> N%, var(--color-app))`로 덮어쓰는 방식을 쓴다(테마가 바뀔 때도 다시 계산). 설정 키를 더할 때의 순서: `td-config` 구조체 + `default.toml` → `task gen-types`(`bindings.ts`·`default-config.json` 재생성, `up_to_date` 테스트가 낡으면 실패) → `Settings.tsx` `SECTIONS` → 설정 탭 목록 테스트(`AGENTS.md`의 Config key checklist).
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 814건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 신규 `apps/desktop/src/__tests__/text-brightness.test.tsx`(vitest)가 값으로 단언한다: 설정 80이면 `document.body.style.getPropertyValue("--color-ink")`가 `80%`를 포함하고 `--color-ink-dull`·`--color-ink-faint`도 같다 / 100이면 세 변수 모두 빈 문자열 / 10이면 `50%`로, 150이면 적용 없음(100)으로 보정된다 / 설정을 80 → 100으로 바꾸면 변수가 지워진다. 구현 전에 실패(red)해야 한다.
  2. 설정 화면에 "글자 밝기" 항목이 있고(`behavior.text_brightness`, 정수 입력) 설정 탭 목록·항목 테스트가 새 항목을 기대 값에 반영해 통과한다.
  3. `cargo test -p td-config`와 `cargo test -p twin-deck-desktop up_to_date`가 통과한다(`task gen-types` 실행 후). 기본값이 `default.toml`에서 100이다.
  4. 회귀 방지: `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음), `cargo clippy -p td-config -- -D warnings` 통과.

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `apps/desktop/src/__tests__/text-brightness.test.tsx`에 DoD 1의 단언을 쓰고 red를 기록한다 — completion criterion: DoD 1이 구현 전에 실패한다
- [ ] S2. 설정 키 추가: `config.rs`의 `Behavior`에 `text_brightness: u32`, `default.toml`에 `text_brightness = 100`, `task gen-types` 실행으로 바인딩·`default-config.json` 갱신 — completion criterion: DoD 3 (depends: S1)
- [ ] S3. 화면 반영: `ui/fonts.ts`(또는 같은 자리)에 `useTextBrightness` 훅을 만들고 `App.tsx`에서 `useUiFont`처럼 부른다. 테마가 바뀔 때도 다시 계산한다 — completion criterion: DoD 1 green (depends: S2)
- [ ] S4. 설정 화면: `Settings.tsx` `SECTIONS`에 `behavior.text_brightness`(int, 설명에 50~100)를 더하고 설정 탭 목록 테스트를 맞춘다 — completion criterion: DoD 2, 4 (depends: S2)
