# 실행 기록 — 원격 SSH keepalive와 조용한 끊김 감지 (#203, 이슈 #108)

워크플로 없이 메인 세션이 직접 실행(fg-loop 드라이브).

## 작업 단위별 결과
- S1 `client_config(keepalive)`(keepalive_interval·keepalive_max 3) + `KEEPALIVE_INTERVAL` 30초 + `SftpConfig.keepalive` 필드, SFTP·원격 셸이 같은 설정 사용 — ✅ 계획대로
- S2 무활동 제한 2초 테스트 서버(`FakeSftp::start_with_inactivity`)로 keepalive 유지 시험 + keepalive 끈 대조 시험 — ✅ 계획대로
- S3 패킷을 버리는 TCP 중계(`Blackhole`)로 조용한 끊김 감지 시험 — ✅ 계획대로. keepalive를 끄면 이 시험이 실패하는 것도 확인함(시험이 keepalive 덕분에 통과함)

## 계획과 달라진 점
- `SftpConfig`에 필드를 더해 기존 생성 지점 9곳(connect.rs, 시험, service.rs)에 `keepalive: Some(KEEPALIVE_INTERVAL)`을 넣었다.
- 실제 20분 무활동·실제 NAT 환경은 확인하지 못함(짧은 시간으로 흉내 낸 대리 시험만).

## DoD 기준값 → 실행 후
- C1 keepalive 시험: 없음 → 3개 통과(blackhole 포함 필터)
- C2 blackhole 시험: 없음 → 1개 통과
- C3 client_config 시험: 없음 → 1개 통과, `client_config(` sftp.rs 4 · shell.rs 1
- `cargo test -p td-remote` 전부 통과(32·18·27), `cargo clippy -p td-remote -- -D warnings` 통과, `cargo check -p twin-deck-desktop --tests` 통과
