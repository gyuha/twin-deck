# RUN — 글자색 설정 값을 Rust에서 검증하고 한계를 설정 설명에 적는다 (리뷰 I)

- S1 red 테스트 — ✅ `text_color_is_validated`(유효: `#1a2b3c`·`#abc`·`#ABCDEF`·빈 값은 경고 없음 / 무효: `red`·`#12345`·`#gggggg`·`javascript:1`·`#abc; background:url(x)`·` #abc`은 경고 1건 + 빈 값으로 복원). 구현 전 실패
- S2 구현 — ✅ `load.rs`의 `validate_text_color`, 설정 화면 "글자 색" 설명에 테마(특히 system) 한계 추가, `text-color.test.tsx`에 설명 단언 1건

## DoD baseline → after
1. 신규 Rust 1건: red → 통과, td-config 28 → 29건
2. `text-color.test.tsx` 7 → 8건 통과(설명 단언)
3. `task gen-types` 후 `up_to_date` 통과, clippy 통과, vitest 통과, tsc 0

## 차이·메모
- 프런트(`fonts.ts`)와 Rust가 같은 규칙(`#rgb`/`#rrggbb`)을 따로 구현한다. 한쪽만 바뀌면 어긋날 수 있다.
- 대비 자동 보정과 테마별 값은 범위 밖이라 하지 않았다. 설명으로만 알린다.
