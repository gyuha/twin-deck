<!-- forge-slug: reveal-config-dir-app-suffix -->
<!-- task: 109 -->
<!-- tdd: on -->
# macOS에서 설정 폴더 열기가 동작하지 않는 문제를 고친다 (이름이 `.app`으로 끝나는 폴더)

## 목표 / 하지 않을 것
- 원인(재현 확인): 설정 폴더 이름이 앱 식별자 `dev.twindeck.app`이라, macOS의 `open <폴더>`가 이 폴더를 앱 번들로 보고 실행하려다 "executable is missing"으로 종료 코드 1로 실패한다. 앱은 `spawn()`만 하고 종료 코드를 보지 않아 실패가 설정 화면에 나오지 않았다. (GitHub 이슈 #35)
- 목표:
  1. `td-launch`의 `reveal_command`: macOS에서 폴더이고 이름이 `.app`(대소문자 무시)으로 끝나면 `open -R <경로>`를 쓴다. (`core.reveal`로 `.app` 이름 폴더를 고른 경우도 같이 고쳐진다.)
  2. "설정 폴더 열기"(`reveal_config_dir`): 설정 폴더 안에 `config.toml`이 있으면 그 파일을 파일로 `reveal`한다(`open -R <config.toml>`: Finder가 폴더 안을 보여 주고 `config.toml`이 선택됨, 실측 확인). 없으면 폴더를 일반 규칙으로 연다.
  3. `SystemLauncher`: macOS의 `open` 명령만 끝날 때까지 기다려 종료 코드가 0이 아니면 stderr를 오류로 돌려준다. 그 오류는 기존 `settingsError` 경고 줄에 나온다(UI 변경 없음). 그 밖의 프로그램(`code`, `explorer`, `xdg-open` 등)은 지금처럼 기다리지 않는다.
  4. `docs/06-config-plugins.md`의 macOS 설정 폴더 경로를 `~/Library/Application Support/dev.twindeck.app/`로 고친다.
- 하지 않을 것: 설정 폴더 이름(앱 식별자)을 바꾸는 일 · Windows·Linux의 실행·종료 코드 처리 변경 · 설정 화면 UI 변경 · 새 Tauri 명령·시그니처 변경(`task gen-types` 불필요) · Windows·Linux 설정 경로 문서 정정(확인하지 못했다)

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음 (새 용어를 만들지 않았다)
- 관련 ADR: 없음
- 관련 이슈: GitHub 이슈 #35
- 갱신할 문서: `docs/06-config-plugins.md` (macOS 설정 폴더 경로)
- 완료 정의(DoD):
  1. `cargo test -p td-launch` 통과이고 새 테스트가 `.app` 이름 폴더 규칙·종료 코드 확인을 다룬다. (사전 상태: 새 테스트가 없어 실패 — 앞으로 가는 확인, TDD의 red) 새 테스트가 확인할 것:
     - `reveal_command(Os::Mac, "/Users/me/Library/Application Support/dev.twindeck.app", true)`가 `open -R <경로>`다. 대소문자(`Foo.APP`)와 끝의 `/`가 붙어도 같다.
     - `reveal_command(Os::Mac, "/Users/me/dir", true)`는 지금처럼 `open <경로>`다(회귀 방지). Windows·Linux의 `.app` 이름 폴더는 규칙을 바꾸지 않는다.
     - 실행기: 종료 코드 0이면 Ok, 0이 아니면 stderr 내용이 담긴 Err. `open` 외의 프로그램은 기다리지 않는다(순수 함수로 분리해 `sh` 같은 도구로 시험).
  2. `cargo test -p twin-deck-desktop` 에서 `reveal_config` 관련 새 서비스 테스트 통과: `config.toml`이 있으면 파일을 reveal하고, 없으면 폴더를 reveal한다(가짜 `Launcher`로 기록). (사전 상태: 없어서 실패 — 앞으로 가는 확인)
  3. `cargo clippy -p td-launch -- -D warnings` 와 `cargo clippy -p twin-deck-desktop -- -D warnings` 통과 (사전 상태: td-launch 통과, 회귀 방지)
  4. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 의 실패가 기준선 4건(`audio-preview` · `preview-scroll` PDF · `theme` · `theme-colors`)뿐이다 (사전 상태: 같은 4건 — 회귀 방지)
  5. `git diff --stat -- packages/ts-client apps/desktop/src` 가 비어 있다 (UI·바인딩 무변경 보증, 사전 상태: 비어 있음 — 회귀 방지)
  6. `grep -c "Application Support/dev.twindeck.app" docs/06-config-plugins.md` 가 1 이상이다 (사전 상태: 0 — 앞으로 가는 확인)
  7. 실제 앱 확인(자동 테스트가 못 보는 부분): macOS에서 설정 화면의 "설정 폴더 열기"를 누르면 Finder가 설정 폴더 안을 열고 `config.toml`이 선택되는지 사람이 본다. 실행 중 `task dev` 앱에서 확인한다.
- 이 DoD의 보증 범위: 위 1~6은 명령 조립과 오류 전달이 맞는지까지이고, "Finder가 실제로 열린다"는 7번(사람)과 이 Mac에서 한 수동 재현(`open -R <config.toml>` 종료 코드 0, 선택 확인)이 근거다.

## 작업 조각
- [ ] S1. 실패하는 테스트 작성(red) — `crates/td-launch/tests/launch.rs`에 `.app` 이름 폴더 규칙과 종료 코드 확인 테스트, `apps/desktop/src-tauri/src/service.rs`에 `reveal_config` 서비스 테스트를 쓰고 구현 전에 실패함을 확인한다. — 완료 기준: 구현 전 새 테스트가 모두 실패, 구현 후 모두 통과
- [ ] S2. `td-launch` 수정 — `reveal_command`의 `.app` 폴더 규칙과 `SystemLauncher`의 macOS `open` 종료 코드 확인(순수 함수로 분리)을 구현한다. (depends: S1) — 완료 기준: DoD 1이 통과하고 `td-launch` clippy가 통과한다
- [ ] S3. 설정 폴더 열기 수정 — `service.rs`에 `reveal_config`(config.toml이 있으면 그 파일, 없으면 폴더)를 만들고 `reveal_config_dir`이 이를 쓰게 한다. (depends: S2) — 완료 기준: DoD 2·3이 통과한다
- [ ] S4. 문서 — `docs/06-config-plugins.md`의 macOS 설정 폴더 경로를 고친다. — 완료 기준: DoD 6이 통과한다
