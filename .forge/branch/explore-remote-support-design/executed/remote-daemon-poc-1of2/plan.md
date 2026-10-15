<!-- forge-slug: remote-daemon-poc-1of2 -->
<!-- task: 166 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 원격 접속 PoC 1/2: 원격 데몬과 원격 클라이언트(목록·읽기)를 루프백으로 증명 (이슈 #72)

## 목표 / 비목표
- 목표: 새 크레이트 `td-remote`에 WebSocket 프로토콜(버전 확인, 토큰 인증), 임의의 `Vfs`를 내보내는 데몬 서버, 블로킹 클라이언트 `RemoteFs`(목록·stat·read_head·스트리밍 읽기)를 만들고, 앱 실행 파일이 창 없이 데몬으로 뜨는 플래그를 더한다. 루프백 통합 테스트로 "목록과 큰 파일 읽기가 원격을 거쳐 그대로 된다"를 증명한다.
- 비목표: `CompositeFs`·설정·UI 연결(2/2), 원격 쓰기/삭제/이름 변경/압축 위임, 로컬→원격 전송, 릴레이·E2E 암호화·QR 페어링, 호스트 등록 UI, TLS, 공개 폴더 제한. `RemoteFs`의 쓰기 계열 메서드는 명확한 "PoC에서 지원하지 않음" 오류를 돌려준다.

## 기준 문서
- 용어: `.forge/branch/explore-remote-support-design/CONTEXT.md`의 원격 호스트·원격 데몬·원격 경로
- 관련 ADR: `docs/adr/0018-remote-daemon.md`(이번 결정), `docs/adr/0003-in-process-ipc.md`(뒤집히는 전제), `docs/adr/0005-vfs-trait.md`, `docs/adr/0017-td-command-is-the-app-executable.md`
- 그릴링에서 정한 것:
  - `Vfs` 트레이트가 동기이므로 클라이언트는 블로킹(동기 `tungstenite` 권장, tokio 불필요). 서버도 연결당 스레드로 충분하다.
  - 요청/응답은 JSON 텍스트 프레임(`id`로 짝), 파일 내용은 바이너리 프레임 청크로 스트리밍한다. 첫 메시지는 프로토콜 버전 + 토큰 핸드셰이크이고, 버전이 다르거나 토큰이 틀리면 이유를 담아 연결을 닫는다.
  - 서버는 `Arc<dyn Vfs + Send + Sync>`를 받는다(크레이트는 `td-vfs`에만 의존 → 2/2에서 `td-archive`가 이 크레이트에 의존해도 순환이 없다). 앱에서는 `CompositeFs`를 넘겨 원격 안 아카이브도 원격이 처리한다.
  - 데몬 기본 주소는 `127.0.0.1:6767`. 다른 주소는 `--listen <주소>`로만 열고 경고를 출력한다. 토큰은 시작할 때 무작위로 만들어 출력한다(또는 환경 변수로 지정 — 테스트·재시작용).
  - `RemoteFs`는 `Vfs` 구현 외에 `read_to(path, &mut dyn Write) -> Result<u64>`를 고유 메서드로 둔다(`td-archive`의 `Archive::read_to`와 같은 모양).
- 완료 기준: `cargo test -p td-remote`가 아래 S1–S4 테스트를 모두 통과하고, `cargo clippy -p td-remote -p twin-deck-desktop -- -D warnings`가 통과하며, 앱 실행 파일을 데몬 플래그로 띄우면 창 없이 주소와 토큰을 출력하고 대기한다.
  - 사전 상태(2026-10-15 실행): `cargo test -p td-remote` → "did not match any packages"(실패, 정방향 검사로 올바름). `main.rs`에 `serve` 없음.

## 작업 조각
- [ ] S1. `crates/td-remote` 생성: 프로토콜 타입·핸드셰이크(버전, 토큰) — 완료 기준: 루프백 서버에 틀린 토큰으로 붙으면 인증 오류, 버전이 다르면 버전 오류가 나는 테스트가 통과한다
- [ ] S2. 서버와 `RemoteFs`의 list/stat/read_head — 완료 기준: 임시 폴더를 `LocalFs`로 내보낸 루프백 서버에서 `RemoteFs::list`·`stat`·`read_head` 결과가 같은 폴더를 `LocalFs`로 직접 읽은 결과와 같다는 테스트가 통과한다 (depends: S1)
- [ ] S3. 스트리밍 읽기 `read_to` — 완료 기준: 청크 크기의 몇 배(예: 5MB) 되는 파일을 `read_to`로 받은 바이트가 원본과 같고, 없는 경로는 NotFound 계열 오류가 되는 테스트가 통과한다. 쓰기 계열 메서드는 "지원하지 않음" 오류 (depends: S2)
- [ ] S4. 앱 실행 파일의 데몬 모드(`--serve`, `--listen`) — 완료 기준: 인수 해석 단위 테스트(기본 127.0.0.1, `--listen`이면 그 주소 + 경고 대상)가 통과하고, `target/debug/twin-deck-desktop --serve`로 띄우면 창 없이 주소·토큰을 출력한다(실행해 확인 후 종료) (depends: S1)
