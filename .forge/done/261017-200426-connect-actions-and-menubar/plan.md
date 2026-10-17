<!-- forge-slug: connect-actions-and-menubar -->
<!-- task: 200 -->
<!-- tdd: off -->
# 원격 연결 기능을 액션 패널·단축키·메뉴바에서 쓸 수 있게 한다 (이슈 #95)

## Goal / Non-goals
- Goal: 이슈 질문 "설정 창 말고 메뉴나 단축키, 커맨드 팔레트에서 원격(SFTP·SSH) 연결을 실행할 수 있나?"의 답을 "예"로 만든다. 지금은 연결 메뉴가 드라이브 바의 "연결" 버튼으로만 열리고, 연결 해제·설정 탭 열기를 액션으로 할 수 없다. 새 액션 4개를 더한다.
  1. `core.menu.connect` — 연결 메뉴("서버에 연결")를 활성 패널에서 연다(`api.openSmbMenu`). 기본 키 **`Alt+4`**(`pane` 스코프; `Alt+1·2·3·0` 메뉴 계열). 메뉴 안에서는 지금처럼 `Enter`가 연결(새 탭), SFTP 항목의 `Shift+Enter`가 SSH(원격 셸) 터미널이다.
  2. `core.remote.disconnect` — 활성 패널이 원격(SFTP·FTP) 탭일 때만 실행되어 그 연결을 끊는다(`api.disconnectRemote`, 드라이브 바의 "끊기" 버튼과 같다). 기본 키 없음.
  3. `core.settings.remote` — 설정을 **SFTP·FTP 서버** 탭에서 연다. 기본 키 없음.
  4. `core.settings.twindeck_remote` — 설정을 **Twin Deck Remote** 탭에서 연다. 기본 키 없음.
  액션 패널에서 "sftp"·"ssh"·"remote"로 찾아지도록 제목(한·영)에 그 낱말을 넣는다. macOS 메뉴바의 File 메뉴에도 "서버에 연결…"(`core.menu.connect`)을 더한다.
- Non-goals: 서버별 직접 연결 항목(팔레트에 "연결: 회사"처럼 서버마다 항목을 만드는 것 — 액션 레지스트리가 정적이다). 연결 해제의 메뉴바 항목. SMB 설정 탭 액션. 연결·재연결 동작 자체의 변경(`core.remote.reconnect`·`connectRemote`는 그대로). Windows·Linux 메뉴바(이 앱은 macOS에서만 네이티브 메뉴바를 만든다). Rust·`Backend` 인터페이스·생성 바인딩·의존성 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none (`docs/05-actions-keybindings.md`, `ui/DriveBar.tsx`의 연결·끊기 버튼, `store.ts`의 `openSmbMenu`·`disconnectRemote`·`openSettings`, `appMenu.ts`의 `FILE_MENU`)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/connect-actions.test.tsx` 종료 코드 0, 테스트 9개 이상 통과 (파일이 없는 지금은 실패 — 앞으로 가야 할 검사). 시험은 최소 이 아홉을 단언한다: (a) 액션 패널에서 `core.menu.connect`를 실행하면 "서버에 연결" 메뉴가 열리고 저장된 서버가 나열되며, 오른쪽 패널이 활성일 때 연 메뉴에서 SFTP 항목을 고르면 연결 탭이 **오른쪽** 패널에 열린다 (b) `Alt+4`가 같은 메뉴를 열고 `Esc`로 닫힌다 (c) 그 메뉴에서 SFTP 항목에 `Shift+Enter`를 누르면 원격 셸 터미널 탭이 열린다 (d) `core.remote.disconnect`는 로컬 패널에서는 실행되지 않고(연결 목록 그대로), 원격 패널에서는 실행되어 연결을 끊고 그 패널이 원격을 벗어난다 (e) `core.settings.remote`는 설정을 "SFTP·FTP 서버" 탭에서, `core.settings.twindeck_remote`는 "Twin Deck Remote" 탭에서 연다 (f) 액션 패널에서 "sftp"를 치면 연결 액션과 SFTP·FTP 설정 액션이, "ssh"를 치면 연결 액션이 목록에 나온다 (g) 영어 제목에도 "SFTP"와 "SSH"(연결), "SFTP"(설정)가 들어 있다 (h) 기본 바인딩: `core.menu.connect`는 `pane` 스코프의 `Alt+4` 하나이고, 나머지 세 액션은 기본 키가 없다 (i) `FILE_MENU`에 `core.menu.connect` 항목이 있고 글자가 한국어 "서버에 연결…"·영어 "Connect to Server…"이며 "파일 정보" 항목 뒤, 마지막 구분선 앞에 있다.
  2. 기존 관련 시험이 수정 없이 통과한다: `cd apps/desktop && bunx vitest run src/__tests__/app-menu.test.ts src/__tests__/drive-bar.test.tsx src/__tests__/remote-panel.test.tsx src/__tests__/settings.test.tsx src/__tests__/settings-in-pane.test.tsx src/__tests__/i18n-keys.test.ts src/__tests__/actions-panel.test.tsx src/__tests__/help-screen.test.tsx src/__tests__/keyboard-scenario.test.tsx src/__tests__/keyboard-scenario-m2.test.tsx src/__tests__/keyboard-scenario-m3.test.tsx` 종료 코드 0, 165개 통과 (회귀 가드: 지금 165 통과 — `i18n-keys`가 새 액션 ID마다 한·영 제목을, `app-menu`가 `FILE_MENU`의 모든 항목을 요구한다).
  3. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0, 저장소 루트에서 `bun run test` 종료 코드 0이고 desktop 통과 수가 1517 이상 (회귀 가드: 지금 1517 통과·1 skipped — `packages/actions`의 키 충돌·액션 목록 시험 포함).
  4. 범위(회귀 가드, 지금도 충족): `git diff --name-only ac767f0 -- crates apps/desktop/src-tauri packages/ts-client package.json apps/desktop/package.json bun.lock Cargo.lock` 출력이 비어 있다.
  5. 문서·등록(사전 상태는 모두 0): `grep -c "core.menu.connect" docs/05-actions-keybindings.md` ≥ 1, `grep -c "core.remote.disconnect" docs/05-actions-keybindings.md` ≥ 1, `grep -c "core.settings.remote" docs/05-actions-keybindings.md` ≥ 1, `grep -c "core.settings.twindeck_remote" docs/05-actions-keybindings.md` ≥ 1, `grep -c "Alt+4" README.md` ≥ 1, `grep -c "Alt+4" README.en.md` ≥ 1, `grep -c "core.menu.connect" packages/actions/src/defaults.ts` ≥ 2(메타데이터 + 바인딩). README 한·영은 한 쌍이라 함께 고친다.

## Work slices
- [ ] S1. `packages/actions/src/defaults.ts`: 액션 4개의 메타데이터(`core.menu.connect` pane·항상, `core.remote.disconnect` pane·`onRemote`일 때만, `core.settings.remote`·`core.settings.twindeck_remote` global·terminal 스코프)와 바인딩 `b("pane", "core.menu.connect", "Alt+4")`를 더하고, `ActionContext`에 `onRemote?: boolean`을 더한다. `store.ts`의 `actionContext`가 `!tab.virtual && isRemotePath(tab.path)`로 채운다 — completion criterion: DoD 1의 (d)(h), DoD 2의 `i18n-keys`·키 충돌 시험
- [ ] S2. `actions.ts` 핸들러: `core.menu.connect` → `api.openSmbMenu(활성 패널, SMB_SECTION, REMOTE_SECTION)`, `core.remote.disconnect` → `api.disconnectRemote(활성 패널)`, `core.settings.remote` → `api.openSettings(REMOTE_SECTION)`, `core.settings.twindeck_remote` → `api.openSettings(TWIN_DECK_REMOTE_SECTION)`. 탭 순번은 `ui/Settings.tsx`가 정한 값을 쓴다 — completion criterion: DoD 1의 (a)(b)(c)(d)(e)
  (depends: S1)
- [ ] S3. i18n ko·en: 액션 제목(`action.<id>`)과 메뉴바 항목(`menu.file.connect`). 제목에 "SFTP"·"SSH"·"Remote" 낱말을 넣어 팔레트 검색에 걸리게 한다 — completion criterion: DoD 1의 (f)(g)
  (depends: S1)
- [ ] S4. `appMenu.ts`: `FILE_MENU`의 "파일 정보" 항목 뒤, 마지막 구분선 앞에 구분선과 `{ key: "menu.file.connect", actionId: "core.menu.connect" }`를 더한다 — completion criterion: DoD 1의 (i), DoD 2의 `app-menu`
  (depends: S3)
- [ ] S5. 시험 `connect-actions.test.tsx`에 DoD 1의 아홉 시험을 쓴다 — completion criterion: DoD 1
  (depends: S2, S3, S4)
- [ ] S6. 문서: `docs/05-actions-keybindings.md`에 네 액션 행과 `Alt+4`, `README.md`·`README.en.md`의 단축키 표·SFTP·FTP 연결 항목에 `Alt+4`(연결 메뉴)와 액션 패널로도 연결할 수 있다는 점을 적는다 — completion criterion: DoD 5
  (depends: S5)
