# RUN — 원격 연결 기능을 액션 패널·단축키·메뉴바에서 쓸 수 있게 한다 (이슈 #95)

워크플로 없이 직접 실행했다(변경이 작다).

## 슬라이스 결과
- S1 `packages/actions/src/defaults.ts` — ✅ as planned. 액션 4개(`core.menu.connect` pane·항상·`Alt+4`, `core.remote.disconnect` pane·`onRemote`일 때만, `core.settings.remote`·`core.settings.twindeck_remote` global·terminal)와 `ActionContext.onRemote`를 더했다. `store.ts`의 `actionContext`가 `!tab.virtual && isRemotePath(tab.path)`로 채운다.
- S2 `actions.ts` 핸들러 — ✅ as planned. `menuHandlers`에서 `store.getState().activePane`으로 활성 패널을 읽어 `api.openSmbMenu(…, SMB_SECTION, REMOTE_SECTION)`·`api.disconnectRemote(…)`를 부르고, 설정 두 액션은 `api.openSettings(REMOTE_SECTION | TWIN_DECK_REMOTE_SECTION)`을 부른다(탭 순번은 `ui/Settings.tsx`가 정한 값).
- S3 i18n ko·en — ✅ as planned. 연결 액션 제목에 "SFTP"·"SSH"를 넣어 팔레트 검색에 걸리게 했다(ko "서버에 연결 (SFTP·FTP·SMB 메뉴, SSH 터미널은 SFTP 항목에서 Shift+Enter)").
- S4 `appMenu.ts` — ✅ as planned. `FILE_MENU`의 "파일 정보" 뒤, 마지막 구분선 앞에 구분선과 "서버에 연결…"을 더했다.
- S5 시험 `connect-actions.test.tsx` 10개 — ✅ as planned (계획의 아홉 + 로컬/원격 패널의 끊기 액션 실행 가능 여부를 액션 패널 행의 `aria-disabled`로 나눠 단언해 10개).
- S6 문서 — ✅ as planned. `docs/05`에 네 행(`core.settings.open`은 원래 행이 없어 설정 두 액션을 원격 액션 행 뒤에 둠), README 한·영의 단축키 표 `Alt+4`와 SFTP·FTP 연결 항목에 설정 창 없이 연결하는 방법.

## DoD baseline → after
1. `connect-actions.test.tsx` — 파일 없음(실패) → 10개 통과
2. 관련 기존 시험(11개 파일) — 165 통과 → 165 통과. **단 아래 두 시험은 갱신했다**(수정 없이는 아님).
3. `tsc --noEmit` 통과 → 통과, `bun run test` desktop 1517 → 1527 통과·실패 0
4. Rust·`ts-client`·의존성 diff — 0 → 0
5. 문서·등록 grep 일곱 모두 0 → 모두 ≥ 1

## 계획 밖 보정·발견
- ① **기존 시험 2개를 갱신했다(계약에서 "수정 없이"라고 했던 것의 예외, loop.md에 기록).** `app-menu.test.ts`는 File 메뉴 글자 전체를 열거해 비교하는 시험이라 사용자가 결정한 메뉴 항목이 늘면 열거에 "서버에 연결…"을 더해야 한다(여전히 전체 목록을 정확히 고정한다). `settings.test.tsx`의 "settings 액션이 기본 키맵에 있다"는 액션 패널에서 `/설정/` 옵션이 하나뿐이라고 가정하는데 새 설정 액션 둘의 제목에도 "설정"이 있어, 여러 옵션 중 "설정 화면 열기"가 있는지 확인하도록 바꿨다(오히려 "설정"으로 검색하면 SFTP·FTP·Twin Deck Remote 설정 액션까지 나오는 것은 바람직하다). 둘 다 단언을 느슨하게 한 것은 아니다.
- ② 시험 코드 실수 둘을 고쳤다(제품 문제 아님): 바인딩의 속성은 `key`가 아니라 `keys` 배열이고, 연결 메뉴의 커서는 이미 첫 항목(SFTP)에서 시작한다.
- ③ 변형 확인(빨강): 끊기 액션을 항상 실행 가능하게 하면 시험 1개가, 연결 핸들러를 지우면 4개가 실패한다. 처음에는 "로컬 패널에서는 실행되지 않는다" 시험이 약했다(`disconnectRemote`가 로컬에서는 원래 아무 일도 안 해서 항상 실행 가능이어도 통과) — 액션 패널 행의 `aria-disabled`를 단언하도록 강화했다.

## 한계
- macOS 네이티브 메뉴바는 jsdom에서 만들어지지 않는다. 메뉴바 항목은 `FILE_MENU` 데이터(위치·글자)와 기존 `app-menu.test.ts`의 설치 시험으로만 확인했고, 실제 macOS 메뉴바에서 "서버에 연결…"이 보이고 눌리는지는 확인하지 못했다.
- `Alt+4`는 기존 `Alt+1·2·3·0`과 같은 방식으로 처리되지만, macOS에서 `Option+4`가 `¢` 입력으로 잡히는지 등 실제 키보드 배열 동작은 확인하지 못했다.
- 서버별 직접 연결 항목(팔레트에 "연결: 회사")과 연결 해제 메뉴바 항목은 범위 밖이라 만들지 않았다(액션 레지스트리가 정적이다). 연결 메뉴 안에서 서버를 고르는 한 단계가 남는다.
- SSH 터미널은 연결 메뉴의 SFTP 항목에서 `Shift+Enter`로 연다(팔레트 제목에 그 안내를 넣었다). 터미널만 여는 별도 액션은 없다.
