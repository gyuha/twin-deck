<!-- forge-slug: text-color-validation -->
<!-- task: 95 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 글자색 설정 값을 Rust에서 검증하고 한계를 설정 설명에 적는다 (리뷰 I)

## Goal / Non-goals
- Goal: `behavior.text_color`가 잘못된 값(`red; background:url(x)` 등)이어도 Rust 설정 로드가 경고 없이 통과하고, 설정 화면은 테마가 바뀌면(`system`) 가독성이 깨질 수 있다는 한계를 알리지 않는다. (1) `td-config`가 `text_color`가 빈 문자열이거나 `#rgb`/`#rrggbb`가 아니면 경고를 내고 기본값(빈 문자열)으로 되돌린다 (2) 설정 화면의 "글자 색" 설명에 "테마를 바꾸면 읽기 어려울 수 있으니 비우면 테마 그대로"를 적는다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- 테마별 글자색 재정의
- 대비 자동 보정
- 색상환 변경
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `crates/td-config/src/load.rs`의 `validate_enums` 방식(경고 + 기본값 복원), `Settings.tsx`의 `behavior.text_color` 항목, `fonts.ts`의 `useTextColor`(프런트에도 같은 정규식이 있다).
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. `cargo test -p td-config text_color_is_validated`(신규)가 통과한다: `#1a2b3c`·`#abc`·``은 그대로, `red`·`#12345`·`#gggggg`·`javascript:1`은 경고가 하나 생기고 값이 빈 문자열이 된다. 구현 전에 실패(red)해야 한다.
  2. `cd apps/desktop && bunx vitest run src/__tests__/text-color.test.tsx` 통과, 설정 화면 항목 설명에 "테마" 단어가 들어간다(그 파일에 단언 추가)
  3. `cargo test -p td-config` 전체 통과, `cargo clippy -p td-config -- -D warnings` 통과, `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과, 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음)

## Work slices
- [ ] S1. 먼저 실패하는 테스트 — completion criterion: DoD 1 구현 전 실패
- [ ] S2. Rust 검증과 설정 설명 — completion criterion: DoD 1·2·3 green (depends: S1)
