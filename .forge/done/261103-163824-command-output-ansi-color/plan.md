<!-- forge-slug: command-output-ansi-color -->
<!-- task: 211 -->
<!-- tdd: on -->
# 명령어 줄 결과 창 ANSI 색 표시 (이슈 #157 ②)

## 목표 / 비목표
- 목표: 명령어 줄로 실행한 명령(예: `git pull`, `git diff`, `ls`)의 색 출력이 결과 창에 내장 터미널과 같은 테마 색으로 보인다.
- 비목표:
  - pty 실행(대화형·pager 지원) — 이는 `command-line-terminal-popup`(task 212)의 몫.
  - 256색(`38;5;n`)·트루컬러(`38;2;…`)·배경색·커서 이동 해석 — 코드만 지우고 기본색으로 둔다.
  - 색 강제 환경 변수를 따르지 않는 도구의 색.
  - npm ANSI 패키지·`dangerouslySetInnerHTML`.

## 기준 정보
- 용어: 결과 창 = `runCommand`가 띄우는 `kind: "info", commandOutput: true` 대화상자(`ui/Dialog.tsx:214-225`, 이슈 #151).
- 관련 ADR: 없음
- 측정한 사실: `td_launch::run_shell`(`crates/td-launch/src/lib.rs:346`)은 stdout/stderr를 파이프로 받아 도구가 색을 끈다. 색 강제·`NO_COLOR` 처리는 아직 없다(`grep -rn "NO_COLOR\|CLICOLOR_FORCE" crates/td-launch/src | wc -l` → 0). 테마별 ANSI 16색은 `lib/themeColors.ts:116 terminalTheme()`이 이미 만든다.
- 결정:
  - 파이프 유지 + 자식 환경에 `CLICOLOR_FORCE=1`, `FORCE_COLOR=1`, `GIT_CONFIG_COUNT=1`/`GIT_CONFIG_KEY_0=color.ui`/`GIT_CONFIG_VALUE_0=always`를 넘긴다. 부모 환경에 `NO_COLOR`가 있으면 넘기지 않는다. 사용자의 기존 `GIT_CONFIG_COUNT`가 있으면 덮어쓰지 말고 뒤에 이어 붙인다.
  - 직접 만든 SGR 해석기(`apps/desktop/src/lib/ansi.ts`, 순수 함수 → 조각 배열): 16색 전경(`30–37`,`90–97`,`39`), `0`, `1`, `2`, `22`. 그 밖의 CSI는 지운다. 맨 앞의 잘린 반쪽 시퀀스는 버린다.
  - 색은 `terminalTheme()` 값을 쓴다. 복사는 ANSI를 지운 글자다.
- 완료 정의(DoD):
  1. `cargo test -p td-launch` 통과, 그중 새 테스트가 `git` 출력에 `\x1b[`가 있음과 `NO_COLOR` 설정 시 없음을 증명 (작성 시점: 새 테스트 없음 → 전향 검사)
  2. `cargo clippy -p td-launch -- -D warnings` 통과 (회귀 방지)
  3. `cd apps/desktop && bunx vitest run src/__tests__/ansi.test.ts src/__tests__/run-command.test.tsx` 통과 — ansi.test.ts는 작성 시점 없음(전향), run-command는 색 span 렌더·복사 시 ANSI 없음 케이스가 추가됨
  4. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 방지; 작성 시점 0)
  5. 실제 앱에서 사람이 확인: git 저장소 폴더에서 `git diff`(변경 있음)·`git status`를 명령어 줄로 실행하면 결과 창의 추가/삭제 줄이 초록/빨강으로 보인다.

## 작업 조각
- [ ] S1. (core) `run_shell` 색 강제 환경 변수 통합 테스트를 먼저 쓰고(임시 git 저장소에서 `git status`/`git diff --stat` 등, `NO_COLOR` 케이스 포함) 구현한다. `cfg(windows)` 경로도 같은 환경 변수를 넘긴다 — 완료 조건: DoD 1·2
- [ ] S2. (ui) `lib/ansi.ts` 해석기의 표 형태 단위 테스트를 먼저 쓰고 구현한다: 색·굵게·초기화 조합, 지원 밖 시퀀스 제거, 잘린 시퀀스, ANSI 제거 함수 — 완료 조건: `bunx vitest run src/__tests__/ansi.test.ts` 통과
- [ ] S3. (ui) 결과 창(`Dialog.tsx`)의 `<pre>`가 조각을 테마 터미널 색 span으로 그리고, 복사 버튼은 ANSI를 지운 글자를 복사한다. FakeBackend로 색 코드가 섞인 출력 테스트를 먼저 쓴다 — 완료 조건: DoD 3·4 (depends: S2)
- [ ] S4. 실제 앱에서 DoD 5를 확인하고 run 노트에 남긴다 — 완료 조건: DoD 5 확인 기록 (depends: S1, S3)
