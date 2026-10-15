<!-- forge-slug: smb-connection-1of2 -->
<!-- task: 167 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# SMB 연결 백엔드: 서버 목록 설정, 키체인, OS 마운트, Tauri 명령

## 목표 / 하지 않을 것
- 목표: 저장된 SMB 서버 항목을 OS에 마운트할 수 있는 백엔드를 만든다. 설정(`[[smb.servers]]`), 키체인 비밀번호, macOS NetFS·Windows 연결, Tauri 명령 → bindings → `Backend`/`TauriBackend`/`FakeBackend`까지 연결해서, 2/2의 UI가 호출만 하면 되게 한다. 범위 결정 문서(00-overview)도 고친다.
- 하지 않을 것: 설정 화면 SMB 탭, DriveBar 연결 메뉴, 비밀번호 대화상자, i18n 문구(전부 2/2). 자체 SMB 클라이언트(`Vfs` 원격 구현체, ADR-0018). Linux 마운트(미지원 오류만). 서버의 공유 목록 조회. 도메인·포트 필드(필요하면 `user`에 `DOMAIN;user`, `host`에 `host:port`). SFTP/FTP(#76).

## 근거 문서
- 용어: `.forge/branch/feature/smb-support/CONTEXT.md`의 **SMB 서버 항목**, **SMB 연결**
- 관련 ADR: `docs/adr/0018-smb-via-os-mount.md`(OS 마운트, 비밀번호는 키체인, 목록은 config.toml), `docs/adr/0005-vfs-trait.md`, `docs/adr/0006-toml-config.md`
- 이슈 추적: GitHub 이슈 #77 (1/2 — 이 부분만으로는 이슈를 닫지 않는다. 2/2 봉인 때 닫는다)
- 완료 정의(DoD):
  0. 선행 조건: 이 worktree에는 `node_modules`가 없어 vitest가 `vite`를 못 찾는다(작성 시점 확인) → 먼저 `bun install`
  1. `cargo test -p td-smb` 통과 (작성 시점: 크레이트 없음 → 실패. 정방향 검사)
  2. `cargo clippy -p td-smb -- -D warnings` 통과, 그리고 `rustup target add x86_64-pc-windows-msvc && cargo clippy -p td-smb --target x86_64-pc-windows-msvc -- -D warnings` 통과 (작성 시점: 이 환경에 Windows 타깃이 설치되지 않아 td-volumes도 E0463로 실패함. 타깃 설치가 선행 조건)
  3. `cargo test -p td-config` 통과, `grep -c 'smb' crates/td-config/src/default.toml` ≥ 1 (작성 시점: 0. 정방향)
  4. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과(bindings·default-config.json 최신)
  5. `cd apps/desktop && bunx tsc --noEmit` 통과, `bun run test` 전체 통과(FakeBackend 추가 후 기존 테스트 회귀 없음 — 회귀 방지 검사라 작성 시점에도 통과)
  6. `grep -n 'SMB' docs/00-overview.md`가 포함 목록의 SMB 연결 관리 줄과 ADR-0018 표 행을 보여 주고, 제외 줄에는 SMB가 없다 (작성 시점: 제외 줄 1개만)
  7. 사람 확인(macOS): 실제 SMB 서버에 대해 Rust 쪽 마운트 함수(테스트 바이너리나 `cargo run` 예제)로 `/Volumes/<공유>`가 생기고, 틀린 비밀번호에서 인증 실패가 구분된 오류로 돌아온다. 이 항목은 테스트로 고정할 수 없다(실제 서버·키체인 필요).

## 작업 단위
- [ ] S1. `td-config`: `smb.servers: Vec<SmbServer { name, host, share, user }>` 추가, `default.toml`에 `[smb]`/빈 목록, 검증(빈 host/share 거부, `name` 비면 `host/share`로 표시). 목록 전체를 쓰는 저장 함수(`toml_edit` array of tables, 기존 `ConfigValue`로는 표현 불가) — 완료 기준: 읽기·쓰기·검증 단위 테스트 통과, 다른 사용자 설정이 보존됨
- [ ] S2. 새 C-free 크레이트 `crates/td-smb`: `Mounter` trait(+ 테스트용 가짜), macOS는 NetFS `NetFSMountURLSync`(`/Volumes`, UI 없음 옵션), Windows는 `WNetAddConnection2W`(드라이브 문자 자동, 비밀번호가 명령줄에 실리지 않게 — `net use`의 명령줄 노출 회피), Linux·기타는 `Unsupported`. 오류는 `Auth`/`Unreachable`/`Unsupported`/`Other`로 구분. `smb://` URL 인코딩(사용자 이름의 `;`·`@`, 공유의 공백·한글 NFC)은 순수 함수로 — 완료 기준: DoD 1·2, URL·오류 매핑 테스트
- [ ] S3. `td-smb` 키체인: `keyring` 크레이트로 서비스 `dev.twindeck.app.smb`, 계정 `user@host/share` 키로 get/set/delete — 완료 기준: 키 생성 순수 함수 테스트, 키체인 실제 접근은 사람 확인(DoD 7)과 함께 (depends: S2)
- [ ] S4. 이미 마운트됨 판정: 마운트된 볼륨의 원본(macOS `statfs` `f_mntfromname` `//user@host/share`, Windows `WNetGetConnectionW`)으로 서버 항목과 맞는 마운트 지점을 찾는다. `td-volumes`의 볼륨 목록은 바꾸지 않고 `td-smb`가 필요한 조회만 한다 — 완료 기준: 원본 문자열 ↔ 항목 매칭 순수 함수 테스트(대소문자·사용자 생략·NFD) (depends: S2)
- [ ] S5. 브리지: `list_smb_servers`/`set_smb_servers`, `smb_connect(index, password: Option<String>, remember: bool) -> { mount_point }`(이미 마운트면 그 경로, 비밀번호 없으면 키체인, 인증 실패면 저장된 키를 지우지 않고 `Auth` 오류 반환, 성공하고 `remember`면 저장), 블로킹 마운트는 `spawn_blocking`. `task gen-types` → `backend.ts` → `tauri.ts` → `fake.ts`(가짜 서버·가짜 마운트, 비밀번호 "bad"면 Auth 오류) — 완료 기준: DoD 4·5, service 테스트로 이미 마운트/키체인 없음/Auth/성공 경로 확인(가짜 `Mounter`·가짜 저장소 주입) (depends: S1, S3, S4)
- [ ] S6. 문서: `docs/00-overview.md` 포함 목록에 "SMB 연결 관리(OS 마운트)" 추가, 제외 줄을 "SFTP 등 자체 원격 파일시스템"으로 고치고 결정 표에 ADR-0018 행 추가, `docs/08-vfs-file-ops.md`나 해당 아키텍처 문서에 `td-smb` 한 줄 — 완료 기준: DoD 6
- [ ] S7. 사람 확인(macOS 실제 NAS) — 완료 기준: DoD 7. Windows는 컴파일 확인까지만 하고 실제 연결 확인은 2/2 이후 Windows 빌드에서 사람이 한다 (depends: S5)
