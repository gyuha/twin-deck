<!-- forge-slug: font-config-backend -->
<!-- task: 43 -->
<!-- part: 1/2 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# 글꼴 설정 값을 설정 파일과 타입 바인딩에 추가

## Goal / Non-goals
- Goal: `td-config`의 `Behavior`에 `ui_font`와 `preview_font`(둘 다 문자열, 기본값 빈 문자열 = 기본 글꼴)를 추가하고, 기본 설정 TOML, 설정 로드/검증, TS 바인딩(`bindings.ts`)과 기본 설정 fixture(`default-config.json`)까지 최신으로 맞춘다.
- Non-goals: 화면 적용과 설정 UI(다음 part), 글꼴 크기, 글꼴 목록 열거.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `cargo test -p td-config`가 새 `font` 테스트(기본값 빈 문자열, 저장→읽기 왕복에서 두 값 분리)를 포함해 통과한다. `UPDATE_BINDINGS=1 cargo test -p twin-deck-desktop up_to_date`로 재생성한 뒤 `cargo test -p twin-deck-desktop up_to_date`가 통과하고 `bindings.ts`·`default-config.json`에 두 키가 있다. 기존 `cargo test --workspace`, fmt, clippy가 통과한다.

## Work slices
- [ ] S1. `crates/td-config/src/config.rs`의 `Behavior`에 두 필드와 `default.toml` 기본값을 추가하고 로드 검증을 맞춘다 — completion criterion: `cargo test -p td-config`의 새 font 테스트가 통과한다
- [ ] S2. TS 바인딩과 기본 설정 fixture를 재생성한다(`task gen-types`) — completion criterion: `cargo test -p twin-deck-desktop up_to_date` 통과, 두 파일에 `ui_font`·`preview_font` 존재 (depends: S1)
- [ ] S3. FakeBackend의 기본 설정이 새 필드를 갖도록 맞춘다 — completion criterion: `bunx tsc --noEmit` 오류 없음, 기존 vitest 전체 결과가 그대로다 (depends: S2)
