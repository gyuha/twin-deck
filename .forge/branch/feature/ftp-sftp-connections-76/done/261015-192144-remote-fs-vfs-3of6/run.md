# run — 원격 경로 표기와 CompositeFs 라우팅 (3/6)

직접 순차 실행.

## 슬라이스 결과
- S1 경로 표기(`td_vfs::{split_remote, remote_url, RemoteLoc}`, `VfsPath::join`/`parent` 원격 규칙) — ✅ 테스트 5개
- S2 `RemoteRegistry`(연결 id → 세션)·`RemoteFs` 변환 — ⚠ 계획은 `RemoteFs`(Vfs 구현)였지만 `CompositeFs`가 `Loc::Remote`로 라우팅하므로 별도 Vfs 타입 없이 `td-archive/src/remote_fs.rs`의 메서드로 두었다
- S3 `CompositeFs` 원격 분기(list·stat·mkdir·create_file·rename(같은 연결만)·remove·copy 4방향·read_head·info, can_trash false, symlink 미지원) — ✅ 링크는 stat으로 대상 종류를 풀어 보여 줌, 원격↔아카이브 복사는 거부
- S4 서비스 테스트 `service::tests::remote::{ftp_session,sftp_session}` 8×2 + 2 — ✅ 테스트용 가짜 서버를 `td-remote`의 `testing` 기능으로 공유하도록 옮김(`td_remote::testing::{ftp,sftp}`)
- S5 회귀·clippy·fmt, ADR-0019 경로 표기 절 — ✅

## 계획과 다른 점 / 한계
- 큐 취소 테스트는 `Aborted|Done` 둘 다 허용한다: 로컬 가짜 서버라 전송이 너무 빨라 취소가 늦는 경우가 있어 결정적이지 않다. "중단 뒤에도 같은 연결로 다음 작업이 된다"만 고정했다.
- `Service::watch/unwatch`는 원격 경로면 아무것도 하지 않고 성공(UI가 감시 오류를 보지 않게) — 계획에 없던 작은 추가.
- 원격에 쓰기는 임시 이름 후 rename이 아니라 바로 대상에 쓴다(중간에 끊기면 부분 파일이 남을 수 있음, Ops 덮어쓰기 롤백은 동작).

## DoD baseline → after
1. `cargo test -p twin-deck-desktop remote` — 0개 → 18개 통과
2. 시나리오(복사 양방향·재귀·이동·이름 바꾸기·삭제·충돌·큐) — FTP·SFTP 각각 ✅ 내용 바이트 비교 포함
3. td-archive·td-vfs·td-ops 회귀 — 통과(기존과 동일)
4. td-vfs/td-archive remote·원격 테스트 수 — 0 → 8 (≥3)
5. clippy·fmt — ✅
6. ADR 경로 표기 — ✅
