# RUN — 글자 밝기 설정(`behavior.text_brightness`)을 추가한다

- S1 red 테스트 — ✅ `text-brightness.test.tsx` 5건(구현 전 3 실패, 기본값·범위 밖 150 2건은 사전 통과) + 설정 화면 1건 추가
- S2 설정 키 — ✅ `config.rs` `Behavior.text_brightness: u32`, `default.toml` 100, `task gen-types`로 바인딩·fixture 갱신
- S3 화면 반영 — ✅ `ui/fonts.ts` `useTextBrightness(brightness, theme)`, `App.tsx`에서 호출. 테마 원래 색을 `<html>`에서 읽어 `<body>`에 `color-mix(…, var(--color-app))`로 덮어쓴다
- S4 설정 화면 — ✅ `Settings.tsx` `SECTIONS`에 "글자 밝기"(int) 추가. 기존 설정 탭 목록 테스트는 항목 수를 세지 않아 수정 없이 통과

## DoD baseline → after
1. text-brightness 단언: 없음 → 6건 통과 (구현 전 3건 red 확인)
2. 설정 화면 항목: 없음 → 있음, 저장·반영 테스트 통과
3. `cargo test -p td-config` 통과(기준선 통과 유지), `up_to_date` 2건 통과, 기본값 100
4. vitest 814 → 820 통과(model-formats 1파일은 기준선 잡음), tsc 0, clippy(td-config) 통과

## 차이·메모
- 계획의 "설정 탭 목록 테스트 수정"은 필요 없었다(항목을 세는 테스트가 없음).
- 값이 100을 넘으면 적용하지 않고(100 취급), 50 미만은 50으로 올린다. 숫자가 아니면 100.
- jsdom에는 테마 CSS가 없어 원래 글자색이 비어 있으므로 그때는 `currentColor`로 대신한다. 실제 앱에서는 테마 값을 쓴다.
- 실제 앱(WKWebView)에서 색이 의도대로 섞이는지, 밝은 테마에서도 자연스러운지는 눈으로 확인하지 못했다.

## 정정 (적대적 리뷰 후)
- 이 기록이 적은 `behavior.text_brightness`(글자 밝기), `useTextBrightness`, `text-brightness.test.tsx`는 최종 구현에 없다. 사용자 요청이 바뀌어(밝기가 아니라 색 지정) 커밋 d7e2d7d에서 `behavior.text_color`와 색상환(react-colorful)으로 교체되었고, 테스트는 `text-color.test.tsx`다.
- 아래 STATUS의 `verified`에 적힌 "text-brightness 6건"도 교체 전 구현의 검증 기록이다.
