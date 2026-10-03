<!-- forge-slug: fkeys-config-launch -->
<!-- task: 8 -->
<!-- part: 1/3 -->
<!-- tdd: off -->
# F키 설정값과 외부 앱 실행 기반 (Rust · 백엔드)

## 목표 / 비목표
- 목표: `config.toml`에 F키 설정(`[fkeys]` F1~F12 → 문자열, `[fkey_apps]` F1~F12 → 앱 경로)을 추가하고, 외부 앱을 경로 인자와 함께 실행하는 백엔드(`td-launch` 명령 생성 + Tauri 명령 `launch_app` + TS 클라이언트/가짜 백엔드 메서드 `launchApp(app, paths)`)를 만든다.
  - `fkeys.Fn` 값의 뜻: `""`(빈 문자열, 기본) = 기본 바인딩 유지 · `"none"` = 그 키 해제 · 그 외 = 액션 ID(앱 실행은 `core.app.launch`).
  - `fkey_apps.Fn` 값: 앱 경로 또는 앱 이름(빈 문자열 = 미지정).
  - 앱 실행 규칙(`td-launch`): macOS는 앱이 `.app`으로 끝나거나 경로 구분자가 없는 이름이면 `open -a <앱> <경로들…>`, 그 외는 실행 파일을 직접 실행(`<앱> <경로들…>`). Windows/Linux는 항상 `<앱> <경로들…>`을 직접 실행. 경로가 0개면 실행하지 않고 오류.
- 비목표: 키맵 병합, `core.app.launch`/`core.help` 액션, 설정 화면 UI(뒤 작업이 한다). 기존 F4 편집기 실행 경로는 건드리지 않는다.

## 기준 문서
- 용어집: 없음 · 관련 ADR: 없음
- 완료 정의(DoD): `.forge/branch/feat/fkey-bindings/loop.md`의 C4, C5 통과 + C1·C2 회귀 없음.
  1. `cargo test -p td-launch` 출력에 `launch_app_mac_bundle`, `launch_app_direct_exec`, `launch_app_spawns_with_paths` 가 각각 `ok` (사전: 테스트 없음 → 전진 확인). 마지막은 unix에서 임시 셸 스크립트를 실제로 실행해 받은 인자를 파일에 쓰게 하고 그 내용을 단언한다(명령 문자열만 확인하는 것으로 대신하지 않는다).
  2. `cargo test -p td-config`에 `fkeys` 기본값(F1~F12 모두 `""`)과 사용자 값 병합, 알 수 없는 F키 이름(`F13`)의 경고를 확인하는 테스트가 있고 통과 (사전: 없음 → 전진 확인). 설정 키가 없던 옛 `config.toml`은 그대로 읽힌다.
  3. `UPDATE_BINDINGS=1 cargo test -p twin-deck-desktop up_to_date`로 `bindings.ts`/`default-config.json` 재생성 후, 환경 변수 없이 `cargo test -p twin-deck-desktop up_to_date` 통과. 재생성된 `default-config.json`에 `fkeys`/`fkey_apps`가 있다(`grep -c fkey_apps packages/ts-client/src/generated/default-config.json` ≥ 1, 사전 0).
  4. `FakeBackend.launchApp`이 호출 기록(`launched: {app, paths}[]`)을 남기고, 실제 Tauri 어댑터(`tauri.ts`)와 `Backend` 인터페이스에 같은 메서드가 있다. `bun run typecheck` 0.
  5. 회귀 방지(사전 통과): `cargo test --workspace` 0, `cargo fmt --all --check` 0, `bunx vitest run` 실패는 pdf-preview 1건뿐.

## 작업 조각
- [ ] S1. `td-launch`: 앱 실행 명령 생성 + 실제 실행 함수와 위 세 테스트 — 완료 기준: DoD 1.
- [ ] S2. `td-config`: `[fkeys]`, `[fkey_apps]` 구조체·default.toml·검증(F1~F12 외 키 경고) 과 테스트 — 완료 기준: DoD 2.
- [ ] S3. Tauri 명령 `launch_app`, TS `Backend.launchApp`, tauri/fake 구현, 바인딩·fixture 재생성 — 완료 기준: DoD 3, DoD 4. (depends: S1, S2)
- [ ] S4. 전체 회귀 확인 — 완료 기준: DoD 5. (depends: S3)
