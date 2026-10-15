# run — 원격 연결 백엔드: 설정, 키체인, 연결·끊기 명령, ts-client (4/6)

직접 순차 실행.

## 슬라이스 결과
- S1 `td-config`: `[[remote.servers]]`(name·protocol·host·port·user·base_dir), 검증(프로토콜·host·포트 범위, 이름·포트 기본값), `set_remote_servers` — ✅ 테스트 6개
- S2 비밀번호 저장소 — ⚠ 계획의 두 안 중 "같은 모양으로 `td-remote`에 둔다"를 택했다: `td-smb`의 `SecretStore`는 오류 타입이 `SmbError`라 그대로 재사용하면 원격 크레이트가 SMB 크레이트에 기대게 된다. `keyring` 의존성과 약 40줄이 중복된다(서비스 이름 `dev.twindeck.app.remote`, 키 `user@host:port/protocol`)
- S3 브리지: `set_remote_servers`·`remote_connect`·`remote_disconnect`·`remote_connections`·`remote_forget_password`, 연결 순서 `td_remote::open_session`, 서비스 쪽 `connect_remote`(레지스트리 재사용) — ✅ 서비스 테스트 `remote::connect`(7개×FTP·SFTP)
- S4 `task gen-types` → backend.ts·tauri.ts·fake.ts — ✅ 원격 경로 헬퍼(`splitRemote`·`remoteUrl`, `parentPath`/`baseName`/`trimTrailingSep` 원격 규칙)와 `RemoteConnectError`까지
- S5 clippy·fmt·회귀 — ✅

## 계획과 다른 점
- 연결 id는 서버 목록 번호가 아니라 `user@host:port`로 정했다. 목록을 고치거나 순서를 바꿔도 탭에 저장된 `sftp://…` 경로가 유효하다. 같은 id를 가진 항목 둘은 한 세션을 공유한다.
- `remote_connections`(연결된 항목 번호들)를 추가했다 — 5/6 UI가 연결 표시에 쓴다. 계획의 명령 목록에는 없었다.
- Rust 문구의 영어 대응표(`apps/desktop/src/i18n/rust.ts`)에 새 문구를 더했다(`i18n-rust-messages` 테스트가 요구).
- 3/6에서 넣은 `td-vfs` 경로 테스트가 `mod tests` 바깥에 있어 i18n 소스 검사에 걸려 `remote.rs`의 `mod tests`로 옮겼다.

## DoD baseline → after
1. `cargo test -p td-config`, `default.toml`의 remote — 0줄 → 2줄, 테스트 통과(59개 중 원격 6개 추가)
2. `task gen-types` 뒤 `up_to_date` — ✅ 통과
3. `cargo test -p twin-deck-desktop remote` — 18개 → 25개(연결 7개 추가): 성공 루트·시작 폴더·재사용·Auth(저장값 보존)·기억 저장·Unreachable·끊기
4. 비밀번호 테스트 수 — 0 → 16(`password|비밀번호` 이름의 테스트), config.toml·읽은 설정에 비밀번호가 없음
5. `tsc --noEmit`(desktop·ts-client)·vitest — ts-client 89개, desktop 1391개 전체 통과(166 파일)
6. clippy -p td-config·td-remote·td-archive·td-vfs·td-smb·fmt·`cargo test --workspace`·`td-smb` 29개 — ✅
