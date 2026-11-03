<!-- forge-slug: command-line-terminal-popup -->
<!-- task: 212 -->
<!-- tdd: on -->
# 명령어 줄 실행 시 터미널 팝업 띄우기 옵션 (이슈 #157 ③)

## 목표 / 비목표
- 목표: 설정 "명령어 줄 실행 시 터미널 띄우기"(`behavior.command_line_terminal`, 기본 `false`)를 켜면 명령어 줄의 Enter가 화면 가운데 xterm 팝업에서 로그인 셸로 명령을 pty 실행한다. 끄면 지금처럼 결과 창에 보인다.
- 비목표:
  - Shift+Enter 같은 1회성 반대 실행 키(필요해지면 나중에 추가).
  - 기존 터미널 탭으로 명령 보내기.
  - 팝업에서의 시간 초과(사용자가 Ctrl+C로 멈춘다). 결과 창 방식의 5분 제한은 그대로.
  - 원격·압축·가상 탭에서의 실행(명령어 줄은 지금처럼 로컬 전용).

## 기준 정보
- 용어: 터미널 팝업 = 명령 하나를 pty로 실행해 보여 주고 끝나면 닫히는 모달 xterm. 기존 "터미널 탭"(패널 안, 셸이 계속 삶)과 다르다.
- 관련 ADR: 없음
- 측정한 사실: `td-terminal`의 `open_command(program, args, cwd, cols, rows)`(`crates/td-terminal/src/lib.rs:169`)와 `resolve_shell`(로그인 셸 `-l`, 이슈 #64), xterm 엔진 `lib/terminalEngine.ts`, 테마 `terminalTheme()`이 있다. 셸 설정은 `environment.terminal`(Windows)이다. `grep -rn command_line_terminal crates apps/desktop/src | wc -l` → 0.
- 결정:
  - 셸: `resolve_shell` 결과에 `-c "<명령>"`(Windows는 각 셸에 맞는 인자)를 붙여 pty로 실행. 출력은 실시간.
  - 끝나면 `[종료 코드 N] 아무 키나 누르면 닫힘`을 쓰고 키를 기다린다(성공해도 자동으로 닫지 않음). 닫히면 포커스는 명령어 줄로 돌아간다. 실행 중 키는 모두 프로그램으로 간다.
  - 기록 남기기·끝난 뒤 목록 다시 읽기는 결과 창 방식과 같다.
  - 팝업은 앱 창의 약 80%, 창 크기가 바뀌면 fit 후 pty resize.
  - 설정 키 체크리스트(AGENTS.md): `td-config` 구조체 + `default.toml` → `task gen-types` → `Settings.tsx` `SECTIONS` → 설정 탭 목록 테스트.
- 완료 정의(DoD):
  1. `cargo test -p td-terminal` 통과, 그중 새 테스트가 "셸 + -c 명령" 실행의 출력과 종료 코드 이벤트를 증명 (작성 시점: 새 테스트 없음 → 전향)
  2. `cargo test -p td-config` 통과, `command_line_terminal` 기본값 false 포함 (전향)
  3. `cargo test -p twin-deck-desktop up_to_date` 통과 (바인딩·default-config.json 재생성; 회귀 방지)
  4. `cargo clippy -p td-terminal -p td-config -- -D warnings` 통과
  5. `cd apps/desktop && bunx vitest run src/__tests__/command-line-terminal.test.tsx src/__tests__/run-command.test.tsx src/__tests__/settings.test.tsx` 통과 — 첫 파일은 작성 시점 없음(전향)
  6. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 방지; 작성 시점 0)
  7. 실제 앱에서 사람이 확인: 설정을 켜고 `git log`(pager)·`ls -G`를 실행하면 팝업에 색과 함께 출력되고 `q`로 pager가 끝나며, 끝난 뒤 키를 누르면 닫히고 명령어 줄에 포커스가 있다. 설정을 끄면 결과 창이 뜬다.

## 작업 조각
- [ ] S1. (core) `td-terminal`에 셸 한 줄 실행 함수(`resolve_shell` + `-c`, Windows 셸별 인자) 추가, pty 통합 테스트 먼저 — 완료 조건: DoD 1, `cargo clippy -p td-terminal -- -D warnings`
- [ ] S2. (core) `td-config`에 `behavior.command_line_terminal: bool`(기본 false)과 `default.toml` 주석 — 완료 조건: DoD 2
- [ ] S3. (bridge) Tauri 명령으로 S1을 노출하고 `task gen-types` → `backend.ts` → `tauri.ts` → `fake.ts`(FakeBackend는 출력·종료 이벤트를 흉내) — 완료 조건: DoD 3 (depends: S1, S2)
- [ ] S4. (ui) `runCommand`가 설정에 따라 결과 창 또는 터미널 팝업으로 갈리게 하고 팝업 컴포넌트(xterm, 종료 후 키 대기, 닫히면 명령어 줄 포커스), `Settings.tsx` 항목과 i18n(ko/en) 추가. 테스트 먼저 — 완료 조건: DoD 5·6 (depends: S3)
- [ ] S5. 실제 앱에서 DoD 7을 확인하고 run 노트에 남긴다 — 완료 조건: DoD 7 확인 기록 (depends: S4)
