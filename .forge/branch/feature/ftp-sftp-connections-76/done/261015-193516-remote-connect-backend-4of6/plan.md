<!-- forge-slug: remote-connect-backend-4of6 -->
<!-- task: 172 -->
<!-- part: 4/6 -->
<!-- tdd: off -->
# 원격 연결 백엔드: 서버 목록 설정, 키체인, 연결·끊기 Tauri 명령, ts-client

## 목표 / 하지 않을 것
- 목표: 저장한 원격 서버 항목(`[[remote.servers]]`)과 키체인 비밀번호를 관리하고, 연결·끊기 명령이 3/6의 세션 레지스트리를 열고 닫아 연결된 원격 루트 경로를 돌려주게 한다. Tauri 명령 → bindings → `Backend`/`TauriBackend`/`FakeBackend`까지 연결해 5/6의 UI가 호출만 하면 되게 한다. SMB 구성(`td-smb`의 `connect`, `SecretStore`, `SmbConnectError(kind)`)을 본뜬다.
- 하지 않을 것: UI(5/6), 호스트 키 신뢰 대화상자, 개인키 인증, 연결 유지(keepalive) 튜닝, 팔레트 액션·단축키.

## 근거 문서
- 용어: `.forge/branch/feature/ftp-sftp-connections-76/CONTEXT.md`의 **원격 서버 항목**, **원격 연결**
- 관련 ADR: `docs/adr/0019-remote-fs-in-process.md`, `docs/adr/0018-smb-via-os-mount.md`(목록은 config.toml·비밀번호는 키체인), `docs/adr/0006-toml-config.md`, `docs/adr/0011-specta-pinned-versions.md`
- 이슈 추적: GitHub 이슈 #76 (4/6)
- 구현 메모: 키체인은 `td-smb`의 `SecretStore`/`KeyringStore`를 재사용하거나 같은 모양으로 `td-remote`에 둔다(서비스 이름 `dev.twindeck.app.remote`, 계정 `user@host:port/protocol`). 두 안 중 중복이 적은 쪽을 고르고 이유를 run.md에 적는다. 기존 `smb_*` 명령·테스트는 건드리지 않는다.
- 완료 정의(DoD):
  1. `cargo test -p td-config` 통과, `grep -c 'remote' crates/td-config/src/default.toml` ≥ 1 (작성 시점: 0 → 정방향)
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과
  3. `cargo test -p twin-deck-desktop remote` 통과(3/6 테스트 포함 + 새 서비스 테스트): 연결 성공 → 원격 루트 경로 반환 / 이미 열린 연결이면 그대로 재사용 / 비밀번호 없음·틀림 → `Auth` 종류 오류(저장된 비밀번호는 지우지 않음) / 닫힌 포트 → `Unreachable` / 끊기 → 세션 닫힘 / 성공하고 `remember`면 키체인에 저장(가짜 저장소 주입)
  4. 서버 목록을 직렬화한 `config.toml` 문자열에 비밀번호가 없다는 테스트가 있다: `cargo test --workspace -- --list 2>/dev/null | grep -c -i 'password\|비밀번호'` ≥ 1 이고 통과
  5. `cd apps/desktop && bunx tsc --noEmit`, `bun run test` 통과(FakeBackend 추가 후 기존 테스트 회귀 없음)
  6. `cargo clippy -p td-config -p td-remote -- -D warnings`, `cargo fmt --check`, 그리고 SMB 기존 테스트(`cargo test -p td-smb`) 통과

## 작업 단위
- [ ] S1. `td-config`: `remote.servers: Vec<RemoteServer { name, protocol(sftp|ftp), host, port, user, base_dir }>`, `default.toml` `[remote]` 주석과 빈 목록, 검증(빈 host 거부, 포트 범위, `name`이 비면 `user@host`로 표시), 목록 전체 저장 함수 — 완료 기준: DoD 1, 다른 사용자 설정 보존 테스트
- [ ] S2. 비밀번호 저장소(키체인) 키 생성 순수 함수와 get/set/delete — 완료 기준: DoD 4의 키 생성·비밀번호 부재 테스트
- [ ] S3. 브리지: `list_remote_servers`·`set_remote_servers`·`remote_connect(index, password, remember) -> { root }`·`remote_disconnect(index)`·`remote_forget_password(index)`. 블로킹 접속은 `spawn_blocking`. 오류는 `RemoteConnectError { kind: Auth|Unreachable|Other }` — 완료 기준: DoD 3 (depends: S1, S2)
- [ ] S4. `task gen-types` → `backend.ts` → `tauri.ts` → `fake.ts`(가짜 원격 서버 목록·가짜 연결, 비밀번호 "bad"면 Auth 오류, 접속하면 가짜 폴더 트리를 `FakeBackend`의 경로 `sftp://…`/`ftp://…` 아래에 노출) — 완료 기준: DoD 2·5 (depends: S3)
- [ ] S5. clippy·fmt·회귀 — 완료 기준: DoD 6 (depends: S4)
