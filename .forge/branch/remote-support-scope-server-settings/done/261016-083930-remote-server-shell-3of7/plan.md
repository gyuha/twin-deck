<!-- forge-slug: remote-server-shell-3of7 -->
<!-- task: 180 -->
<!-- part: 3/7 -->
<!-- tdd: off -->
# Twin Deck Remote 서버 PTY 셸 채널과 클라이언트 셸 열기 (3/7)

## Goal / Non-goals
- Goal: 서버가 SSH 세션의 pty-req·shell 요청을 받아 PTY 셸을 열고 입출력·크기 변경을 중계한다(`td-terminal`의 `Terminals`/portable-pty 재사용). 쓰기 허용과 별개로 셸은 서버 설정 `allow_shell`(기본 끔)이 켜져야만 열린다. 클라이언트 쪽에는 `td-remote`에 셸 채널을 여는 API(`open_shell(cols, rows)` → 쓰기·읽기·크기 변경 핸들)를 둔다.
- Non-goals: UI, 설정 키 연결, Windows 셸(unix 한정 테스트, Windows는 컴파일만).

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0019-remote-fs-in-process.md
- Definition of Done: `cargo test -p td-remote server_shell` 통과(셸을 열어 `echo <마커>` 후 마커 수신, `allow_shell=false`면 셸 요청 거부), `cargo clippy -p td-remote -- -D warnings` 통과.

## Work slices
- [ ] S1. 서버 쪽 PTY 셸 채널 — 완료 기준: 테스트가 마커 출력을 받는다.
- [ ] S2. `allow_shell` 게이트 — 완료 기준: 꺼져 있으면 셸 요청이 거부된다.
- [ ] S3. 클라이언트 `open_shell` API와 크기 변경 — 완료 기준: resize 후 `stty size`가 바뀐 크기를 돌려준다(depends: S1).
