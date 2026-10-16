# 실행 기록 — "확장자 유지" 옵션: 확장자 컬럼을 켜도 파일 이름에 확장자를 유지 (이슈 #86)

fg-loop 구동 중 직접 실행했다(tdd off).

## 슬라이스별 결과
- S1 Rust — ✅ 계획대로. `BehaviorTable.keep_extension`(기본 꺼짐)과 `default.toml`, Rust 테스트 `keep_extension_defaults_off_and_user_can_turn_it_on`, `task gen-types`로 바인딩·기본 설정 fixture 재생성.
- S2 UI — ✅ 계획대로. `FileTable.tsx`: 유지가 켜지면 이름에서 확장자를 빼지 않고(`hasExtColumn`에 `&& !keepExt`) 확장자 칸은 빈 문자열로 그림. `Settings.tsx`: `확장자 컬럼 표시` 바로 아래 스위치. ko/en 문구. 테스트 5건(`keep-extension.test.tsx`).
- S3 문서 — ✅ 계획대로. `docs/06`의 확장자 컬럼 문단 뒤에 옵션 설명.

## DoD baseline → after
1. `keep-extension.test.tsx`: 없음 → 5 passed.
2. `cargo test -p td-config keep_extension`: 0건 → 1건 통과.
3. `default.toml keep_extension = false` 0 → 1, `bindings.ts` 0 → 1, `up_to_date` 2건 통과 → 통과.
4. `tsc` 통과, vitest 전체 1414건 통과(1건 건너뜀 — 다른 세션의 SFTP 통합 테스트가 실행 파일 없을 때 건너뛰는 것으로 이번 변경과 무관).
5. clippy `-p td-config`·`fmt --check` 통과(회귀 방어).
6. `docs/06 keep_extension`: 0 → 1.

## 계획과 다른 점
- 없음. README는 확장자 컬럼을 언급하지 않아 바꾸지 않았다(AGENTS.md의 README 한·영 쌍 규칙 해당 없음).

## 알려진 한계
- jsdom 단언이다. 실제 앱(WKWebView)에서의 겉모양은 확인하지 못했다.
