<!-- forge-slug: remote-server-config-bridge-4of7 -->
<!-- task: 181 -->
<!-- part: 4/7 -->
<!-- tdd: off -->
# Twin Deck Remote 설정 키와 브리지(서버 켜기·끄기·상태) (4/7)

## Goal / Non-goals
- Goal: `[remote_server]` 설정(enabled=false, bind="127.0.0.1", port, root, allow_write=false, allow_shell=false)을 `td-config`와 `default.toml`에 추가하고, 비밀번호는 OS 키체인에 둔다. `Service`에 서버 시작·정지·상태(실행 여부·수신 주소·호스트키 지문) 명령을 만들고 Tauri 명령·`Backend` 인터페이스·`tauri.ts`·`fake.ts`에 연결한다. 앱 시작 시 enabled면 서버를 켠다.
- Non-goals: 설정 탭 UI, 클라이언트 `twindeck` 프로토콜, 터미널 UI.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0019-remote-fs-in-process.md
- Definition of Done: `task gen-types` 뒤 `cargo test -p twin-deck-desktop up_to_date` 통과, `cargo test -p twin-deck-desktop remote_server` 통과(서비스에서 켜면 포트가 열리고 끄면 닫힌다), `cargo clippy -p td-config -p twin-deck-desktop -- -D warnings`, `cd apps/desktop && bunx tsc --noEmit` 통과. 위험 기본값(enabled=true, bind=0.0.0.0)이 `default.toml`에 없다: `grep -c 'enabled = true\|0.0.0.0' crates/td-config/src/default.toml` → 0 (0만으로는 부족하므로 같은 파일에 `[remote_server]` 항목이 `grep -c remote_server` ≥ 1로 있음을 함께 확인).

## Work slices
- [ ] S1. 설정 구조체·기본값·검증(포트 범위·루트 존재) — 완료 기준: td-config 테스트 통과.
- [ ] S2. `Service` 시작·정지·상태와 키체인 비밀번호 — 완료 기준: `remote_server` 서비스 테스트 통과(depends: S1).
- [ ] S3. Tauri 명령 → 타입 생성 → backend.ts → tauri.ts → fake.ts — 완료 기준: `up_to_date`와 tsc 통과(depends: S2).
