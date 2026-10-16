# run — 클라이언트 원격 터미널 (6/7)

general-purpose 에이전트에 위임해 구현하고, 핵심 검증은 직접 다시 돌렸다.

- S1 서비스·명령·Backend — ✅ `Service::remote_terminal_open(connection_id, cols, rows)`, Tauri `terminal_open_remote`, `terminalOpenRemote`. 세션 번호는 로컬 터미널과 같은 번호 공간(`Terminals::alloc_id`)이고 `ShellEvent`를 `TermEvent`로 바꿔 같은 `terminal_events`로 흘린다. 접속 정보는 메모리에만 보관
- S2 UI 연결 — ✅ 기존 `core.terminal.focus`/`core.terminal.open_folder`가 활성 패널이 `sftp://`이면 원격 셸을 연다(새 액션·키 없음, 탭 이름 `터미널: <연결 id>`)

DoD baseline → after:
- `cargo test -p twin-deck-desktop remote_terminal` : 0개 → 4 passed(직접 재실행). 마커 수신·Exit, 셸 비허용·FTP·없는 id 오류
- FakeBackend vitest 4개 passed(직접 재실행), 로컬 터미널 회귀 없음(terminal 필터 5·td-terminal 15 통과는 에이전트 보고)
- tsc·fmt·up_to_date 통과(직접), clippy·vitest 전체 1397(에이전트 보고, 첫 실행엔 2건이 부하로 흔들렸다가 재실행에 통과)
- `docs/05-actions-keybindings.md`의 `core.terminal.focus` 설명 갱신

계획과 다른 점·한계:
- 계획은 "twindeck 연결에서만"이었으나 Service가 twindeck와 일반 SFTP를 구분하지 않아 **SFTP 연결이면 모두** 허용, FTP는 거부로 단순화했다.
- 원격 셸은 항상 서버 홈에서 시작한다(폴더로 `cd`하지 않음). 연결을 끊어도 열린 셸 탭은 산다(별도 SSH 연결). 앱 재시작 후엔 먼저 연결해야 한다.
- 실제 앱 화면(WKWebView xterm 입출력, 실제 서버 연결)은 눈으로 확인하지 못했다.
