<!-- forge-slug: sftp-terminal-connect-button -->
<!-- task: 192 -->
<!-- priority: high -->
<!-- tdd: off -->
# 설정의 SFTP·FTP 탭에 "터미널 연결" 버튼을 더한다 (이슈 #94 ①)

## Goal / Non-goals
- Goal: 설정 > 연결 > SFTP·FTP 탭에서 SFTP 서버를 고르면 "터미널 연결" 버튼이 켜진다. 누르면 기존 연결 흐름(비밀번호·호스트 키 확인)으로 활성 패널을 서버에 연결한 뒤, 곧바로 그 서버의 원격 셸 터미널 탭을 연다. 연결이 실패하거나 취소되면 터미널도 열지 않는다.
- Non-goals: Rust·Tauri 명령·`Backend` 인터페이스 변경(원격 셸은 `terminalOpenRemote`로 이미 있다). FTP·Twin Deck 서버의 터미널(버튼은 꺼 둔다). 연결 메뉴의 `Shift+Enter`(plan `sftp-terminal-menu-shift-enter`). 패널을 옮기지 않는 "터미널만" 모드.

## Source of truth
- Glossary terms: none
- Related ADRs: none (원격 셸 이슈 #72, `docs/05-actions-keybindings.md`의 `core.terminal.focus` 행)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/remote-terminal-connect.test.tsx` 종료 코드 0, 테스트 3개 이상 통과 (파일이 없는 지금은 실패 — 앞으로 가야 할 검사). 시험은 최소 이 셋을 단언한다: (a) SFTP 서버를 고르면 버튼이 켜지고, 누르면 `FakeBackend`의 `terminalOpenRemote`가 그 연결 id로 불리고 터미널 탭이 생긴다 (b) FTP 서버를 고르면 버튼이 꺼져 있다 (c) 비밀번호 창을 취소하면 터미널 탭이 생기지 않고 `terminalOpenRemote`도 불리지 않는다.
  2. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 가드: 지금도 통과한다).
  3. `bun run test` 종료 코드 0, 통과 수가 1453 이상 (회귀 가드: 지금도 통과한다 — 기존 `remote-terminal`·`settings` 시험이 그대로 통과해야 한다).
  4. `git diff --name-only 5e2bda2..HEAD -- crates apps/desktop/src-tauri packages/ts-client/src/generated` 출력이 비어 있다 (회귀 가드: Rust·생성 파일을 건드리지 않는다).
  5. `grep -c "터미널 연결" docs/07-ui-spec.md` ≥ 1 (지금은 0).

## Work slices
- [ ] S1. `store.ts`에 `connectRemoteTerminal(pane, index)` 추가: `connectRemote`를 재사용하고, 끝난 뒤 그 패널의 활성 탭이 정말 그 서버(`splitRemote(path)`의 id가 `remoteServerId(server)`)일 때만 `terminalFocus()`를 부른다. 연결 실패·취소 때 로컬 터미널이 열려서는 안 된다 — completion criterion: 취소·실패 경로에서 터미널 탭이 생기지 않고, 성공 경로에서 원격 셸 탭이 생기는 단위 시험이 통과한다
- [ ] S2. `Settings.tsx`의 원격 서버 목록 버튼 줄에 "터미널 연결" 버튼 추가(i18n `ko.ts`·`en.ts`): `current.protocol === "sftp"`일 때만 켜진다. 누르면 변경분 저장 → 설정 닫기 → `connectRemoteTerminal(settingsPane, selected)` (기존 "연결" 버튼과 같은 순서) — completion criterion: DoD 1의 (a)(b)(c)
  (depends: S1)
- [ ] S3. `docs/07-ui-spec.md`의 설정 SFTP·FTP 서버 설명에 "터미널 연결" 버튼(SFTP만, 연결 뒤 원격 셸 탭, 실패·취소면 터미널 없음)을 한두 문장으로 적는다 — completion criterion: DoD 5
