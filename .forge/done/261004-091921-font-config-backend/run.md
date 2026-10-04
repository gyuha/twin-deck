# RUN — 글꼴 설정 값을 설정 파일과 타입 바인딩에 추가 (font-config-backend)

워크플로 없이 직접 실행했다(작은 작업).

- S1 `Behavior`에 `ui_font`/`preview_font`와 `default.toml` 기본값(빈 문자열), td-config 테스트 2개 추가 — ✅ 계획대로
- S2 `task gen-types`로 `bindings.ts`·`default-config.json` 재생성 — ✅ 계획대로
- S3 FakeBackend 기본 설정 — ✅ 변경 불필요(FakeBackend가 `default-config.json`을 읽어 자동으로 새 필드를 가진다)

## DoD baseline → after
- `cargo test -p td-config`의 font 테스트: 0개 → 2개 통과(`font_settings_default_empty_and_stay_independent`, `font_settings_round_trip_through_user_config`)
- `up_to_date` 바인딩 테스트: 통과 → 통과(재생성 후)
- `bindings.ts`/`default-config.json`의 `ui_font`·`preview_font`: 0 → 각 1
- `cargo test --workspace`, fmt, clippy(td-config, twin-deck-desktop): 통과 → 통과
- vitest 전체: 496 통과 · 실패 1(기존 `pdf-preview`) → 동일

## 어긋난 점
- 없음. 로드 검증(`ENUMS`)은 자유 문자열이라 추가하지 않았다.
