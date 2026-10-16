# run — Twin Deck Remote 서버 뼈대 (1/7)

워크플로 없이 직접 실행했다(범위가 한 크레이트의 새 모듈 하나).

- S1 `ServerConfig`·`ServerHandle`·`start` — ✅ 계획대로 (포트 0 → 실제 포트 `local_addr`)
- S2 호스트키 생성·저장·로드 — ✅ 계획대로 (unix 0600, 재시작 후 지문 동일)
- S3 비밀번호 인증 — ⚠ 계획은 `connect_session`으로 확인이라 했으나, 서버에 SFTP 서브시스템이 아직 없어 russh 클라이언트로 `authenticate_password` 결과를 직접 확인했다. 비밀번호가 빈 설정은 모두 거부하도록 추가했다.

DoD baseline → after:
- `cargo test -p td-remote server_host_key` : 0개 → 1 passed
- 비밀번호 틀림 거부 : 테스트 없음 → `server_password_auth` passed
- `cargo clippy -p td-remote -- -D warnings` (--all-targets 포함) : 통과 → 통과 (회귀 방지용이라 이미 통과 상태)

기타: `anyhow`·`rand`를 `testing` 기능의 선택 의존에서 일반 의존으로 바꿨다(서버 모듈이 쓴다).
