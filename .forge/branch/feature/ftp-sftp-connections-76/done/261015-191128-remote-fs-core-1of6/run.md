# run — 원격 파일시스템 결정(ADR-0019)과 td-remote 크레이트 (1/6)

직접 순차 실행(워크플로 없음, 한 크레이트라 비용이 작다).

## 슬라이스 결과
- S1 ADR-0019 작성 — ✅ as planned
- S2 `crates/td-remote`(RemoteError·RemoteEntry·RemoteSession·RemoteWrite, 경로 보조 join/parent/file_name) — ✅ 쓰기는 `RemoteWrite::finish`가 있는 별도 trait(FTP 전송 완료 확정 때문)
- S3 FTP 구현(suppaftp 12) — ⚠ 제어 연결 재사용 + 전송은 전송마다 새 연결, MLSD 우선 후 LIST 폴백. 목록 줄 파싱은 `type=` 유무로 MLSD/LIST를 가른다(처음 MLSD 파서를 먼저 시도했다가 LIST 줄을 크기 0으로 잘못 읽는 것을 테스트가 잡음)
- S4 `tests/ftp_server.rs` 가짜 FTP 서버 + 18개 테스트 — ✅
- S5 clippy·fmt — ✅

## DoD baseline → after
1. ADR 파일 — 없음 → 있음, 0018 언급 ✅
2. `cargo test -p td-remote` — 크레이트 없음 → 18 passed
3. 테스트 수 ≥10 — 0 → 18, `tests/ftp_server.rs` 1개
4. 동작 항목 — list·stat·mkdir 중첩·빈 파일·rename·삭제·재귀 삭제·1MiB+ 왕복 바이트 동일·Auth·Unreachable·NotFound 모두 테스트 ✅
5. clippy(`--all-targets`)·fmt — ✅
