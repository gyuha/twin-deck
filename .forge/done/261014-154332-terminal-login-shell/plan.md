<!-- forge-slug: terminal-login-shell -->
<!-- task: 153 -->
<!-- tdd: on -->
# 내장 터미널을 로그인 셸로 연다 (이슈 #64)

## 목표 / 비목표
- 목표: macOS·Linux에서 내장 터미널이 `$SHELL -l`(로그인 셸)로 열려, `.zprofile`(Homebrew `brew shellenv` 등)이 적용되도록 한다. 지금은 인자 없는 비로그인 셸이라 Finder/Dock으로 띄운 앱의 최소 PATH만 받아 brew로 설치한 `zoxide`·`starship`을 못 찾는다(추정, 보고자 환경은 재현하지 못함 [중간]).
- 비목표:
  - Windows 셸 선택(`cmd`·`powershell`·`gitbash`)은 건드리지 않는다.
  - 로그인 셸 여부를 고르는 설정 키는 만들지 않는다(질문 1에서 A로 결정, C는 채택하지 않음).
  - 앱 시작 시 환경을 한 번 읽어 와 주입하는 방식(B)은 하지 않는다.
  - `lsd` 색상 테마가 안 먹는 문제는 이번에 다루지 않는다. 원인을 아직 설명하지 못했다. 배포 후 보고자에게 다시 확인해 달라고 이슈에 요청한다(질문 2에서 a로 결정).
  - `default.toml`·설정 화면 문구·i18n은 바꾸지 않는다(설정 바인딩 재생성을 피한다).

## 진실의 원천
- 용어: 없음
- 관련 ADR: 없음
- 완료 정의(DoD):
  1. `cargo test -p td-terminal login` → 새 로그인 셸 테스트가 통과한다. **red→green**: 수정 전 코드에서는 `.zprofile` 표식이 빠져 실패해야 하고(슬라이스 S1에서 실제로 실패를 확인해 기록), 수정 후 통과한다.
  2. `cargo test -p td-terminal resolve_shell_unix_args` → 비Windows의 `resolve_shell`이 인자 `["-l"]`을 돌려주는 단위 테스트가 통과한다(수정 전 `vec![]`라 실패).
  3. `cargo test -p td-terminal` 전체가 통과한다. 단, 기존 `tests::exit_code_comes_as_an_exit_event`는 병렬 실행에서 간헐적으로 실패한다(작성 시점에 확인: 전체 실행 때 1건 실패, 단독 실행은 통과). 이 한 건만 실패하면 `cargo test -p td-terminal exit_code`로 단독 재실행해 통과를 확인한다.
  4. `cargo clippy -p td-terminal -- -D warnings`와 `cargo fmt --check`가 통과한다.
  5. 세 군데 문서가 로그인 셸임을 말한다: `grep -c "로그인" crates/td-terminal/src/lib.rs docs/09-platform-support.md docs/06-config-plugins.md` → 파일마다 `≥1`. (작성 시점에 세 파일 모두 0건이라 이 항목은 앞으로 향하는 확인이다.)
  - 작성 시점의 재현(전제 확인): 임시 HOME의 `.zprofile`(`TD_PROFILE`)과 `.zshrc`(`TD_RC`)를 두고 pty에서 `zsh -i`는 `PROFILE=no RC=1`, `zsh -l -i`는 `PROFILE=1 RC=1`을 출력했다. 즉 비로그인은 `.zshrc`만 읽고, 로그인은 둘 다 읽는다.
  - 이 DoD는 `lsd` 테마 문제의 해결을 증명하지 않는다(비목표). 실제 앱·실제 brew 도구에서의 확인은 자동화하지 않고 사용자(보고자) 확인이 필요하다.

## 작업 조각
- [ ] S1. 먼저 실패하는 테스트를 쓴다. (a) `resolve_shell`이 비Windows에서 `-l`을 돌려준다는 단위 테스트 `resolve_shell_unix_args`(기존 `windows가_아니면_선택과_상관없이_shell_환경_변수를_쓴다` 옆에 둔다). (b) unix 전용 통합 테스트: 임시 폴더를 `HOME`·`ZDOTDIR`로 하고 `.zprofile`·`.zshrc`에 서로 다른 표식 변수를 export하게 한 뒤, `resolve_shell`이 돌려준 프로그램·인자로 pty 셸을 열어 두 표식이 모두 출력되는지 본다. `/bin/zsh`가 없으면 건너뛴다. — 완료 기준: 두 테스트가 현재 코드에서 실패하고, 실패 출력(어느 표식이 빠졌는지)을 run 기록에 남긴다.
- [ ] S2. `resolve_shell`의 비Windows 분기가 `(셸, vec!["-l"])`을 돌려주게 한다(`crates/td-terminal/src/lib.rs`). `/bin/sh` 폴백에도 같은 인자를 쓴다. — 완료 기준: DoD 1·2·3이 통과한다. (depends: S1)
- [ ] S3. 문서 세 군데를 맞춘다: `lib.rs`의 `resolve_shell` 문서 주석, `docs/09-platform-support.md`의 "기본 셸" 줄, `docs/06-config-plugins.md`의 `terminal` 설정 줄. 비Windows는 `$SHELL`을 로그인 셸(`-l`)로 연다고 쓴다. — 완료 기준: DoD 5가 통과한다. (depends: S2)
- [ ] S4. 린트와 서식을 확인한다. — 완료 기준: DoD 4가 통과한다. (depends: S3)
