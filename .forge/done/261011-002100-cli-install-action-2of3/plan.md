<!-- forge-slug: cli-install-action-2of3 -->
<!-- task: 135 -->
<!-- part: 2/3 -->
<!-- tdd: on -->
# 앱 안의 "명령줄 도구 설치/제거" 액션: macOS는 /usr/local/bin/td 링크, Windows는 사용자 PATH (2/3)

## 목표 / 하지 않을 것
- 목표: 직접 내려받아 쓰는 사용자(Homebrew·설치 파일을 거치지 않은 경우)도 앱 안에서 `td` 명령을 설치하고 제거할 수 있다. (GitHub 이슈 #45) Actions Panel(`Mod+Shift+P`)에 액션 `core.cli.install`·`core.cli.uninstall`(기본 키 없음)이 있다.
  - macOS 설치: `/usr/local/bin/td`를 **앱 실행 파일로 가는 심볼릭 링크**로 만든다. 먼저 그냥 만들어 보고, 폴더가 없거나 쓰기 권한이 없으면 macOS 관리자 암호 창(`osascript`의 `do shell script … with administrator privileges`)으로 만든다. 권한 상승으로 실행하는 것은 **고정된 두 명령(`mkdir -p /usr/local/bin && ln -sfn '<앱 실행 파일>' /usr/local/bin/td`, `rm '/usr/local/bin/td'`)뿐**이고 경로는 앱이 직접 계산한 값만, 작은따옴표를 이스케이프해서 넣는다. 사용자 입력은 명령에 들어가지 않는다. 실행 전 확인 창이 무엇을 하는지(링크를 만든다, 관리자 암호를 물을 수 있다)를 보여 준다.
  - macOS 제거: `/usr/local/bin/td`가 **심볼릭 링크이고 그 대상이 이 앱의 실행 파일**일 때만 지운다. 다른 프로그램의 `td`거나 일반 파일이면 지우지 않고 알린다. 설치할 때 `/usr/local/bin/td`가 이미 있고 우리 링크가 아니면 덮어쓰지 않고 "다른 `td`가 있다"고 알린다(Treasure Data CLI 등과 충돌 방지).
  - 상태: `cli_status`가 설치됨/아님/다른 `td`가 있음을 돌려주고, 확인 창과 알림 문구가 그것을 따른다.
  - Windows 설치: 앱 폴더에 `td.cmd`(`@echo off` + `start "" "%~dp0<exe 이름>" %*`)가 없으면 만들고, 그 폴더를 **사용자 PATH**(`HKCU\Environment`의 `Path`)에 중복 없이(대소문자 무시) 더한 뒤 환경 변경을 알린다(`WM_SETTINGCHANGE`). 제거는 그 항목만 뺀다. 관리자 권한은 필요 없다. (설치 파일이 이미 등록한 경우 `이미 설치됨`으로 끝난다.)
  - 순수 로직을 부수 효과와 분리한다: 설치 계획 만들기(macOS 링크 판단·osascript 문자열), PATH 문자열 더하기·빼기(Windows), `td.cmd` 내용, 제거 가능 여부 판정. 실제 파일·레지스트리·`osascript` 호출은 얇게 둔다(`cfg(unix)`/`cfg(windows)`).
- 하지 않을 것: Homebrew Cask·설치 파일·README(3번) · 앱을 열 때마다 설치 여부를 자동 확인하거나 권하는 안내 · Linux용 설치(링크 경로가 배포마다 다르다) · `~/.local/bin` 등 다른 위치 · 자동 업데이트 시 링크 수리

## 기준 문서
- 용어: `.forge/CONTEXT.md`의 "td 명령"
- 관련 ADR: 없음
- 이슈 추적: GitHub 이슈 #45
- 갱신할 문서: `docs/05-actions-keybindings.md`(두 액션)
- 완료 정의(DoD):
  1. `cargo test -p twin-deck-desktop cli_install::` 통과 ≥ 10, 실패 0 (사전 상태: 0건 — 앞으로 가는 확인): 심볼릭 링크 판단(우리 링크·남의 링크·일반 파일·없음)과 제거 가능 여부, osascript 명령 문자열(작은따옴표가 든 경로의 이스케이프, 고정 명령 두 개만), `td.cmd` 내용, PATH 더하기(중복·대소문자·끝 세미콜론 처리)·빼기, 임시 폴더를 쓴 링크 만들기·지우기(unix)
  2. `cargo test -p twin-deck-desktop up_to_date` 통과 (사전 상태: 통과 — 새 명령·DTO를 더하면 `task gen-types` 반영 확인용)
  3. `cd packages/ts-client && bunx vitest run` 통과, 설치 계약 테스트 ≥ 2 포함 (사전 상태: 시작 경로 계약까지 통과, 설치 테스트 없음 — 앞으로 가는 확인)
  4. `cd apps/desktop && bunx vitest run src/__tests__/cli-install.test.tsx` 통과 ≥ 5, 실패 0 (사전 상태: 파일 없음): (a) Actions Panel에서 설치 액션이 확인 창을 거쳐 `cliInstall`을 부른다 (b) 취소하면 부르지 않는다 (c) 설치된 상태에서는 제거 액션이 `cliUninstall`을 부른다 (d) 다른 `td`가 있으면 알림만 보이고 설치하지 않는다 (e) 실패 오류를 알림으로 보인다
  5. 회귀 방지(사전 상태: 이미 통과): `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run` 기준선, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`, `packages/actions` 테스트, `ko`/`en` 키 일치
  6. 실제 확인(자동 검증 불가, 사람이 한다): macOS에서 (i) 액션 실행 → 관리자 암호 창 → `ls -l /usr/local/bin/td`가 앱 실행 파일을 가리키고 새 터미널에서 `td .`가 된다 (ii) 제거 액션 → 링크가 사라진다, 다른 `td`는 지워지지 않는다. Windows는 컴파일·단위 테스트까지만 확인되고 레지스트리·PATH 반영은 실제 Windows에서 사람이 확인해야 한다(이 환경에는 Windows 대상 도구가 없다).

## 작업 조각
- [ ] S1. (red→green) `cli_install.rs`: 순수 로직(링크 판단, osascript 문자열, PATH 편집, `td.cmd` 내용)과 테스트를 먼저 쓴다. — 완료 기준: DoD 1
- [ ] S2. 얇은 실행부: unix 링크 만들기·지우기와 관리자 권한 `osascript` 경로, `cfg(windows)`의 `td.cmd` 쓰기·레지스트리·`WM_SETTINGCHANGE`. (depends: S1) — 완료 기준: DoD 1의 임시 폴더 테스트, DoD 6(i)(ii)
- [ ] S3. 명령 `cli_status`·`cli_install`·`cli_uninstall`, DTO, `task gen-types`, ts-client(`Backend`·`TauriBackend`·`FakeBackend`) + 계약 테스트. (depends: S2) — 완료 기준: DoD 2, 3
- [ ] S4. 액션 두 개(`defaults.ts`·`actions.ts`)와 스토어 흐름(확인 창 → 설치/제거 → 알림), ko/en 문구, `cli-install.test.tsx`, `docs/05`. (depends: S3) — 완료 기준: DoD 4, 5
