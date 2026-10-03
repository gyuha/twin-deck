# RUN — F키 설정값과 외부 앱 실행 기반 (fkeys-config-launch)

실행 방식: 규모가 작아 Dynamic Workflow 없이 메인 세션에서 직접 실행(스킬이 허용하는 경로). `running.md`는 위임이 없어 만들지 않았다.

## 슬라이스별 결과
- S1 `td-launch`: `app_command`/`Launch::launch_app`과 테스트 3종 — ✅ 계획대로 (dev-dependency `tempfile` 추가)
- S2 `td-config`: `[fkeys]`, `[fkey_apps]`(F1~F12) 구조체·default.toml·테스트 — ✅ 계획대로. F13 같은 알 수 없는 키는 기존 병합 로직이 이미 경고하므로 별도 검증 코드는 필요 없었다
- S3 Tauri `launch_app`, `Backend.launchApp`, tauri/fake 구현, 바인딩 재생성 — ✅ 계획대로 (service에 `launch_app`: 없는 경로가 있으면 실행하지 않음)
- S4 전체 회귀·품질 확인 — ✅ 계획대로

## DoD baseline → after
1. `cargo test -p td-launch` launch_app 3종: 없음 → 3개 모두 ok (전진). 마지막은 임시 셸 스크립트를 실제 실행해 `/p/$(id); x.txt` 같은 경로가 쪼개지지 않고 인수로 도착함을 파일로 확인.
2. `cargo test -p td-config` fkeys 테스트: 없음 → ok (전진). 기본값 12개, 옛 파일 호환, 사용자 값 병합, `fkeys.F13` 경고.
3. 바인딩/fixture: `grep -c fkey_apps default-config.json` 0 → 1, 환경 변수 없이 `up_to_date` 통과.
4. `FakeBackend.launched`·Backend 인터페이스·tauri 어댑터: 없음 → 있음, `bun run typecheck` 0.
5. 회귀 방지(사전 통과 → 그대로): `cargo test --workspace` 0, `cargo fmt --check` 0, vitest 실패는 기존 pdf-preview 1건뿐(420 passed).

## 발견한 것
- 실제 Tauri 앱에서 외부 앱이 뜨는 것은 이 작업 범위(백엔드 기반)에서는 확인하지 않았다. UI와 키 연결은 뒤 작업(2/3, 3/3)에서 한다.
- macOS 앱 규칙: `.app`이거나 경로 구분자 없는 이름이면 `open -a`. `editor_command`와 규칙이 달라(점이 든 이름도 번들이면 `open -a`) 별도 함수로 두었다.
