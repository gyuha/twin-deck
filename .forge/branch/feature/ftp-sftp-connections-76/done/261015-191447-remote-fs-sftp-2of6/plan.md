<!-- forge-slug: remote-fs-sftp-2of6 -->
<!-- task: 170 -->
<!-- part: 2/6 -->
<!-- tdd: off -->
# td-remote SFTP 구현과 가짜 SFTP 서버 테스트

## 목표 / 하지 않을 것
- 목표: 1/6의 `RemoteSession` trait을 SFTP로 구현한다(SSH 비밀번호 인증). 같은 프로세스에서 띄운 가짜 SFTP 서버(로컬 TCP)로 검증한다.
- 하지 않을 것: 개인키·에이전트 인증, known_hosts 영구 신뢰(첫 접속은 호스트 키를 받아들이되 세션 안에서 고정만 한다 — 한계를 ADR-0019에 한 줄 적는다), `Vfs` 연결(3/6), UI.

## 근거 문서
- 용어: `.forge/branch/feature/ftp-sftp-connections-76/CONTEXT.md`의 **원격 서버 항목**
- 관련 ADR: `docs/adr/0019-remote-fs-in-process.md`(1/6에서 작성)
- 이슈 추적: GitHub 이슈 #76 (2/6)
- 구현 메모: SFTP 클라이언트는 `russh` + `russh-sftp`(순수 Rust, async)를 우선 검토한다. 가짜 서버도 같은 크레이트의 서버 측으로 만든다. 동기 `RemoteSession`에 맞추려고 크레이트 내부 current-thread 런타임에서 `block_on`으로 감춘다(호출 스레드가 이미 tokio 런타임 안이면 패닉하지 않도록 `Handle::try_current` 처리).
- 완료 정의(DoD):
  1. `cargo test -p td-remote` 통과, `ls crates/td-remote/tests | grep -c sftp` ≥ 1, `cargo test -p td-remote -- --list 2>/dev/null | grep -c ': test'` ≥ 20 (작성 시점: sftp 테스트 없음 → 정방향)
  2. 테스트 동작: 1/6 DoD 4와 같은 항목을 SFTP로 확인(list·stat·mkdir·빈 파일·rename·삭제·재귀 삭제·업로드/다운로드 바이트 동일·잘못된 비밀번호 `Auth`·닫힌 포트 `Unreachable`·없는 경로 `NotFound`), 그리고 1MiB 이상 파일 왕복이 청크 경계에서 깨지지 않는다
  3. `cargo clippy -p td-remote -- -D warnings`, `cargo fmt --check` 통과
  4. `grep -c -i 'sftp' docs/adr/0019-*.md` ≥ 1 (호스트 키 한계 문구 포함 — 작성 시점 ADR이 1/6에서 만들어지므로 그 뒤 정방향)

## 작업 단위
- [ ] S1. SFTP 클라이언트 구현(접속·인증·`RemoteSession` 전부, 오류를 `RemoteError`로 매핑: 인증 거부 → `Auth`, 연결 거부·타임아웃 → `Unreachable`, `NoSuchFile` → `NotFound`) — 완료 기준: DoD 2
- [ ] S2. `tests/sftp_server.rs`: 비밀번호 인증만 받는 가짜 SFTP 서버(임시 폴더 기반) — 완료 기준: DoD 1·2 (depends: S1)
- [ ] S3. 큰 파일·한글 이름 케이스, 런타임 중첩 호출 케이스 — 완료 기준: DoD 2 (depends: S2)
- [ ] S4. ADR-0019에 SFTP 호스트 키 한계 한 줄, clippy·fmt — 완료 기준: DoD 3·4 (depends: S3)
