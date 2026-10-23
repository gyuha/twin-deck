<!-- forge-slug: remote-keepalive-1of2 -->
<!-- task: 203 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# 원격 SSH 연결(SFTP·원격 셸)에 keepalive를 넣고 조용히 끊긴 연결을 감지한다 (이슈 #108)

## 목표 / 하지 않는 것
- 목표: SFTP 세션과 원격 셸이 공용 클라이언트 설정(`client_config()`)으로 30초마다 keepalive를 보내, 무활동으로 끊기지 않게 한다(Twin Deck Remote 서버의 기본 무활동 제한 600초, NAT·방화벽). 응답이 `keepalive_max`번 없으면 연결을 닫아 `is_alive()`가 거짓이 되게 해, 기존 "다시 연결" 버튼(이슈 #98)이 뜨게 한다.
- 하지 않는 것: 자동 재연결(2of2), keepalive 간격 설정 항목, 내장 서버(Twin Deck Remote)의 무활동 제한 변경, FTP(스스로 다시 연결함).

## 기준 자료
- 용어집: 없음 · 관련 ADR: 없음(ADR-0019는 docs/adr)
- 원인 근거: `client::Config::default()`는 `keepalive_interval: None`(russh 0.63.1 client/mod.rs), 서버 기본 `inactivity_timeout: 600초`(server/mod.rs), `td-remote/src/server/mod.rs:230`은 기본값 사용.
- 시험 가능하게 keepalive 간격은 `SftpConfig`에서 바꿀 수 있어야 한다(기본 30초, 시험은 짧게, `None`이면 끔). 공개 API를 넓히는 것은 시험용 최소 범위로.
- 완료 정의(DoD): loop.md C1·C2·C3 통과 + C6 중 `cargo test -p td-remote`·`cargo clippy -p td-remote -- -D warnings` 통과.

## 작업 단위
- [ ] S1. `client_config(keepalive)` 공용 함수(keepalive_interval·keepalive_max) 추가, SFTP·셸 접속에 사용, `SftpConfig`에 keepalive 간격 필드(기본 30초) — 완료 기준: C3
- [ ] S2. 무활동 제한이 짧은 테스트 서버로 keepalive 유지 시험 + keepalive 끈 대조 시험 — 완료 기준: C1 (의존: S1)
- [ ] S3. 패킷을 버리는 TCP 프록시로 조용한 끊김 감지 시험 — 완료 기준: C2 (의존: S1)
