# run — 원격 연결 문서 (6/6)

직접 순차 실행.

## 슬라이스 결과
- S1 `docs/00-overview.md` 포함 목록에 SFTP·FTP 줄, 제외 줄을 "자체 SMB 클라이언트"와 "FTPS·SSH 키 인증·호스트 키 영구 신뢰"로 바꿈, 결정 표에 ADR-0019 행 — ✅
- S2 `README.md`·`README.en.md`에 SFTP·FTP 연결 항목(짝, 첫 줄 언어 링크 유지) — ✅ 열기·미리보기 불가, 영구 삭제, 평문 FTP, 호스트 키 미확인을 한계로 적었다
- S3 `docs/02-architecture.md` 크레이트 표에 `td-remote`, `docs/adr/README.md`에 0019 — ✅ 덤으로 `docs/07-ui-spec.md`의 설정 그룹 문구(연결: SMB 서버, SFTP·FTP 서버)를 현재 상태로 고침

## DoD baseline → after
1. 개요 포함·결정 표 — 제외 줄 1개만 → 포함 줄 + ADR 행 ✅
2. 제외 줄에서 SFTP 제거 — `자체 원격 파일시스템` 줄이 없어짐 ✅
3. README sftp — 0/0 → 1/1(대소문자 무시 줄 수), 언어 링크 유지 ✅
4. `td-remote` in 02-architecture — 0 → 1줄 ✅
5. `docs/adr/README.md` — 0019 행이 목록 형식대로 들어감 ✅(`SFTP` 1줄)
