<!-- forge-slug: remote-server-sftp-2of7 -->
<!-- task: 179 -->
<!-- part: 2/7 -->
<!-- tdd: off -->
# Twin Deck Remote 서버 SFTP 서브시스템과 루트 가두기 (2/7)

## Goal / Non-goals
- Goal: 서버가 SFTP 서브시스템을 제공한다(russh-sftp 서버 쪽). 모든 경로는 설정한 루트 아래로 가두고(`..`·절대경로·심볼릭 링크 탈출 거부), `allow_write=false`면 쓰기 계열(쓰기·만들기·삭제·이름 바꾸기·권한)을 거부한다.
- Non-goals: 셸, 설정·UI, 압축·해제.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0019-remote-fs-in-process.md, 1of7의 서버 뼈대
- Definition of Done: `cargo test -p td-remote server_sftp` 통과(기존 SFTP 클라이언트로 목록·읽기·쓰기·이름 바꾸기·삭제), `cargo test -p td-remote server_jail` 통과(`..`, 절대경로, 심볼릭 링크 탈출 거부, 읽기 전용 쓰기 거부). 서버 쪽 NFD/NFC 파일명 재시도 규칙(AGENTS.md 플랫폼 주의)을 지킨다.

## Work slices
- [ ] S1. 가두기 경로 해석기(`server/jail.rs`): 요청 경로 → 루트 하위 실제 경로, 탈출 시 오류 — 완료 기준: `server_jail`의 경로 테스트(`..`, 절대경로, 심볼릭 링크)가 통과한다.
- [ ] S2. SFTP 핸들러(읽기 계열: opendir·readdir·stat·open·read·realpath) — 완료 기준: 클라이언트 목록·읽기 테스트 통과(depends: S1).
- [ ] S3. SFTP 쓰기 계열과 `allow_write` 게이트 — 완료 기준: 쓰기 허용 시 쓰기·이름 바꾸기·삭제가 되고 끄면 전부 거부된다(depends: S2).
