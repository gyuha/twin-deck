# 실행 기록 — macOS 설정 폴더 열기 수정 (이슈 #35)

워크플로우 없이 한 세션에서 직접 처리했다. TDD(`tdd: on`)로 테스트를 먼저 썼다.

## 조각별 결과
- S1 실패하는 테스트 — ✅ `crates/td-launch/tests/launch.rs`(`.app` 이름 폴더 규칙, `run_wait`), `service.rs`(`reveal_config`). 구현 전에는 `td_launch::run_wait`가 없어 컴파일 단계에서 실패(red).
- S2 `td-launch` — ⚠ 계획에 없던 테스트 1건 추가: macOS 전용으로 실제 `open`이 `.app` 이름 임시 폴더를 열다 실패하고 그 실패가 `Err`로 올라오는지 확인한다(이슈의 재현을 회귀 테스트로 고정). 구현은 `reveal_command`의 `.app` 규칙(`is_app_bundle_name`)과 `run_wait`(종료 코드·stderr 확인), `SystemLauncher`가 macOS의 `open`만 `run_wait`로 실행.
- S3 설정 폴더 열기 — ✅ `service.rs`에 `reveal_config`(config.toml이 있으면 그 파일, 없으면 폴더), `reveal_config_dir`이 사용.
- S4 문서 — ✅ `docs/06-config-plugins.md` macOS 행을 `dev.twindeck.app`으로, 이름이 `.app`으로 끝나 Finder가 앱 번들로 다룬다는 설명을 덧붙였다(계획에 없던 짧은 주석).

## DoD (baseline → after)
1. `cargo test -p td-launch`: 새 테스트 없음(컴파일 실패) → 13건 통과 (3건 추가)
2. `cargo test -p twin-deck-desktop`: `reveal_config` 테스트 없음 → 50건 통과 (1건 추가, `up_to_date` 포함)
3. clippy `td-launch`·`twin-deck-desktop` `-D warnings`: 통과 → 통과 (회귀 방지)
4. tsc: 통과 → 통과. vitest 실패: 기준선 4건 → 같은 4건, 새 실패 0건 (회귀 방지)
5. `packages/ts-client`·`apps/desktop/src` diff: 비어 있음 → 비어 있음 (회귀 방지)
6. `grep -c "Application Support/dev.twindeck.app" docs/06-config-plugins.md`: 0 → 1
7. 실제 앱 확인: **미실시** (사람이 확인해야 한다)
- `cargo fmt --check`: 작업 전 깨끗 → 내 변경분이 어긋나 `cargo fmt`로 정리 후 통과.

## 알아 둘 것
- 실제 macOS에서의 수동 재현(이 Mac, macOS 26.4.1): `open <설정 폴더>` 종료 코드 1("executable is missing"), `open -R <설정 폴더>/config.toml` 종료 코드 0이고 폴더 안이 열리며 config.toml 선택됨. 보고자는 macOS 27이라 환경이 다르다.
- `core.reveal`로 `.app` 폴더를 고르면 이제 `open -R`로 선택해 보여 준다(앱 번들이 실행되지 않는다).
