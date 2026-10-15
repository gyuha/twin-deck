<!-- forge-slug: remote-fs-core-1of6 -->
<!-- task: 169 -->
<!-- part: 1/6 -->
<!-- tdd: off -->
# 원격 파일시스템 결정(ADR-0019)과 td-remote 크레이트: 세션 trait, FTP 클라이언트, 가짜 FTP 서버 테스트

## 목표 / 하지 않을 것
- 목표: ADR-0018이 이슈 #76으로 미룬 "원격 `Vfs`가 필요한가"를 결정해 ADR-0019로 남기고, 새 크레이트 `crates/td-remote`에 프로토콜 중립 블로킹 세션 trait과 FTP 구현을 만든다. 같은 프로세스에서 띄운 가짜 FTP 서버(로컬 TCP)로 동작을 검증한다.
- 하지 않을 것: SFTP(2/6), `Vfs`·CompositeFs 연결(3/6), 설정·키체인·브리지(4/6), UI(5/6), FTPS(TLS).

## 근거 문서
- 용어: `.forge/branch/feature/ftp-sftp-connections-76/CONTEXT.md`의 **원격 서버 항목**, **원격 연결**
- 관련 ADR: `docs/adr/0018-smb-via-os-mount.md`(후속 항목: 원격 Vfs 여부는 #76에서 결정), `docs/adr/0005-vfs-trait.md`, `docs/adr/0012-archive-path-notation.md`
- 이슈 추적: GitHub 이슈 #76 (1/6 — 이 부분만으로는 닫지 않는다)
- 결정 요지(ADR에 쓴다): OS 마운트로는 FTP(macOS 읽기 전용)·SFTP(기본 미지원)가 안 되므로 앱 안에 원격 클라이언트를 두고 `Vfs`로 감싼다. 동기 `Vfs`와 맞추려고 크레이트 안에서 블로킹 API를 제공한다(SFTP가 async 크레이트면 내부 런타임으로 감춘다). 검토한 대안: 별도 전송 창(다운로드/업로드만), OS 마운트(불가), 외부 도구 의존.
- 완료 정의(DoD):
  0. 선행 조건: `bun install`이 필요한 항목이 있으면 먼저 실행
  1. `test -f docs/adr/0019-*.md`이고 `grep -c 'ADR-0018\|0018' docs/adr/0019-*.md` ≥ 1 (작성 시점: 파일 없음 → 정방향)
  2. `cargo test -p td-remote` 통과 (작성 시점: 크레이트 없음 → 실패, 정방향)
  3. `cargo test -p td-remote -- --list 2>/dev/null | grep -c ': test'` ≥ 10, 그리고 `ls crates/td-remote/tests | grep -c ftp` ≥ 1 (정방향)
  4. 테스트가 확인하는 동작: list(이름·크기·종류·수정 시각)·stat·mkdir(중첩)·빈 파일 만들기·이름 바꾸기·파일 삭제·폴더 재귀 삭제·업로드·다운로드(바이트 동일)·잘못된 비밀번호는 `Auth` 오류·닫힌 포트는 `Unreachable` 오류·없는 경로는 `NotFound`
  5. `cargo clippy -p td-remote -- -D warnings`, `cargo fmt --check` 통과

## 작업 단위
- [ ] S1. `docs/adr/0019-remote-fs-in-process.md` 작성(상태 Accepted, 위 결정 요지와 대안, 결과·단점: 동기 API·재연결·평문 FTP 경고) — 완료 기준: DoD 1
- [ ] S2. `crates/td-remote` 생성(워크스페이스 members에 추가): `RemoteError { Auth, Unreachable, NotFound, AlreadyExists, Other(String) }`, `RemoteEntry`, `RemoteSession` trait(list·stat·mkdir_all·create_empty·rename·remove_file·remove_dir_all·read(오프셋 읽기 또는 스트림)·write(스트림)·home 폴더) — 완료 기준: DoD 2 컴파일, 파일 시스템 의존 없음(세션은 네트워크만 다룬다)
- [ ] S3. FTP 구현(`suppaftp` 등 순수 Rust 크레이트): 접속·로그인·패시브 모드, LIST/MLSD 파싱(MLSD 우선, 없으면 LIST 유닉스 형식), 한글 파일명(UTF-8) — 완료 기준: DoD 4의 FTP 항목 (depends: S2)
- [ ] S4. `tests/ftp_server.rs`: 테스트용 최소 가짜 FTP 서버(USER/PASS/PWD/CWD/TYPE/PASV/LIST/MLSD/RETR/STOR/MKD/RMD/DELE/RNFR/RNTO/SIZE/QUIT, 메모리 또는 임시 폴더 기반)를 `TcpListener`로 띄우고 S3을 실제 소켓으로 검증 — 완료 기준: DoD 3·4 (depends: S3)
- [ ] S5. clippy·fmt 정리 — 완료 기준: DoD 5 (depends: S4)
