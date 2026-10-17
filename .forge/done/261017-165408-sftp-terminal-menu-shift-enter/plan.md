<!-- forge-slug: sftp-terminal-menu-shift-enter -->
<!-- task: 193 -->
<!-- tdd: off -->
# 연결 메뉴에서 Shift+Enter로 SFTP 서버를 터미널로 연다 (이슈 #94 ②)

## Goal / Non-goals
- Goal: 드라이브 바의 "서버에 연결" 메뉴에서 SFTP 항목에 커서를 두고 `Shift+Enter`를 누르면 연결 뒤 원격 셸 터미널 탭을 연다(`Enter`는 지금처럼 연결만). 이 동작을 알리도록 SFTP 항목 오른쪽에 "Shift+Enter: 터미널" 배지를 흐리게 보여 준다. SFTP가 아닌 항목(SMB·FTP·설정 항목)에서 `Shift+Enter`를 누르면 아무것도 연결하지 않는다.
- Non-goals: Rust·Backend 변경. 다른 메뉴(Volumes·즐겨찾기·최근)의 `Shift+Enter`. 설정 화면의 버튼(plan `sftp-terminal-connect-button`, 이 plan은 그 plan의 `connectRemoteTerminal`을 쓴다). 메뉴 마우스 클릭의 터미널 변형.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/remote-terminal-menu.test.tsx` 종료 코드 0, 테스트 4개 이상 통과 (파일이 없는 지금은 실패 — 앞으로 가야 할 검사). 시험은 최소 이 넷을 단언한다: (a) SFTP 항목에서 `Shift+Enter` → `terminalOpenRemote`가 불리고 터미널 탭이 생기며 메뉴가 닫힌다 (b) 같은 항목에서 `Enter`만 누르면 패널만 연결되고 `terminalOpenRemote`는 불리지 않는다 (c) FTP 항목과 SMB 항목에서 `Shift+Enter`는 `remoteConnect`·`smbConnect`·`terminalOpenRemote`를 모두 부르지 않는다 (d) "Shift+Enter" 배지가 SFTP 항목에만 보이고 FTP·SMB 항목에는 없다.
  2. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 가드: 지금도 통과한다).
  3. `bun run test` 종료 코드 0, 통과 수가 1453 이상 (회귀 가드: 지금도 통과한다 — `packages/actions`의 시험과 i18n 짝 검사 포함).
  4. `git diff --name-only 5e2bda2..HEAD -- crates apps/desktop/src-tauri packages/ts-client/src/generated` 출력이 비어 있다 (회귀 가드).
  5. `grep -c "core.menu.select_terminal" docs/05-actions-keybindings.md` ≥ 1 (지금은 0) 그리고 `grep -c "core.menu.select_terminal" packages/actions/src/defaults.ts` ≥ 2 (메타데이터 + `panel` 스코프 바인딩, 지금은 0).

## Work slices
- [ ] S1. `packages/actions/src/defaults.ts`에 액션 `core.menu.select_terminal`(scopes `panel`)과 바인딩 `b("panel", "core.menu.select_terminal", "Shift+Return")`을 더하고, `actions.ts`에 핸들러를 잇는다. `Return`(연결)과 `Shift+Return`이 서로 가로채지 않는지 시험으로 확인한다 — completion criterion: DoD 1의 (a)(b)
- [ ] S2. `store.ts`에 `menuSelectTerminal()` 추가: 커서 항목이 `remote` 항목이고 그 서버가 SFTP면 메뉴를 닫고 `connectRemoteTerminal(pane, index)`; 그 밖의 항목은 아무것도 연결하지 않는다(메뉴는 유지하거나 짧은 알림 — 둘 중 하나로 정하고 시험에 고정한다) — completion criterion: DoD 1의 (a)(c)
  (depends: S1)
- [ ] S3. `openSmbMenu`가 SFTP 항목에 표시용 플래그를 붙이고, `PopupMenu.tsx`가 그 항목 오른쪽에 "Shift+Enter: 터미널" 배지를 흐리게 그린다(i18n `ko.ts`·`en.ts`). 연결 중이라 비활성인 항목에는 그리지 않는다 — completion criterion: DoD 1의 (d)
  (depends: S2)
- [ ] S4. `docs/05-actions-keybindings.md`의 `core.menu.*` 근처에 `core.menu.select_terminal` 행(키 `Shift+Enter`, scope `panel`, 자체 ID)을 더하고, 연결 메뉴 설명에 `Shift+Enter` 동작을 한 줄 적는다 — completion criterion: DoD 5
