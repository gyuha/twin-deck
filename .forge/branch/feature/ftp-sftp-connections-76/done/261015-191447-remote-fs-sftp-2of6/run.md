# run — td-remote SFTP 구현과 가짜 SFTP 서버 테스트 (2/6)

직접 순차 실행.

## 슬라이스 결과
- S1 SFTP 클라이언트(`SftpSession`, russh 0.63 + russh-sftp 3, 크레이트 내부 멀티스레드 런타임) — ✅ 오류 매핑 Auth/Unreachable/NotFound
- S2 `tests/sftp_server.rs`: russh 서버 + SFTP 서브시스템 가짜 서버, 18개 테스트 — ✅
- S3 큰 파일(1MiB+)·한글 이름·tokio 런타임 안 호출 — ⚠ 런타임 안에서 세션을 버리면 "Cannot drop a runtime" 패닉이 나는 것을 테스트가 잡아 `Rt` 래퍼(Drop에서 `shutdown_background`)로 고침
- S4 ADR-0019에 SFTP·호스트 키 한계 — ✅

## DoD baseline → after
1. 테스트 통과·sftp 테스트 파일·테스트 수 — 36(ftp 18 + sftp 18) ≥ 20, sftp 파일 0 → 1
2. 동작 항목(왕복 바이트 동일, 청크 경계, Auth, Unreachable, NotFound) — ✅
3. clippy(--all-targets)·fmt — ✅, 3회 반복 통과(불안정 없음)
4. ADR에 sftp·호스트 키 문구 — ✅
