<!-- forge-slug: remote-server-core-1of7 -->
<!-- task: 178 -->
<!-- part: 1/7 -->
<!-- tdd: off -->
# Twin Deck Remote 서버 뼈대: russh 서버, 비밀번호 인증, 영속 호스트키 (1/7)

## Goal / Non-goals
- Goal: `td-remote`에 SSH 서버(`server` 모듈)를 만든다. 127.0.0.1:0 같은 주소에 바인딩해 시작·정지할 수 있고(`start`가 실제 포트를 돌려주는 핸들), 비밀번호 인증만 받으며, 호스트키는 파일로 저장해 재시작해도 같은 지문을 쓴다. 채널 처리(SFTP·셸)는 뒤 part가 붙인다.
- Non-goals: SFTP 서브시스템, 셸 채널, 설정·UI, 공개키 인증, 클라이언트 호스트키 검증.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0019-remote-fs-in-process.md (러스트 russh 사용, 블로킹 API 규칙)
- Definition of Done: `cargo test -p td-remote server_host_key` 통과(재시작 후 지문 동일, 처음엔 키 파일 생성, 파일 권한은 unix에서 0600), 비밀번호 틀림은 `Auth` 오류, `cargo clippy -p td-remote -- -D warnings` 통과.

## Work slices
- [ ] S1. `td-remote/src/server/mod.rs`에 `ServerConfig { bind, port, root, allow_write, password, host_key_path }`와 `ServerHandle { local_addr, fingerprint, stop() }`, `start(config)`를 만든다 — 완료 기준: 포트 0으로 시작하면 실제 포트가 `local_addr`에 담긴다.
- [ ] S2. 호스트키 생성·저장·로드(`host_key.rs`) — 완료 기준: 테스트 `server_host_key`가 재시작 전후 지문 같음을 확인한다.
- [ ] S3. 비밀번호 인증 핸들러 — 완료 기준: 기존 `connect_session`으로 맞는 비밀번호는 연결되고 틀린 비밀번호는 `Auth`다(depends: S1).
