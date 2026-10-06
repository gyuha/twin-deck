<!-- forge-slug: update-backend-plugin -->
<!-- task: 74 -->
<!-- part: 1/3 -->
<!-- tdd: off -->
# 업데이트 확인·설치 백엔드 (Tauri updater 플러그인 연결)

## Goal / Non-goals
- Goal: Rust 쪽에 `tauri-plugin-updater`를 붙이고, 프런트가 부르는 command 두 개 — `check_update`(새 버전 있으면 버전·릴리스 노트를 돌려주고 없으면 없음) 와 `install_update`(내려받아 설치한 뒤 앱을 다시 시작) — 를 만든다. `tauri.conf.json`에 업데이트 엔드포인트(`https://github.com/gyuha/twin-deck/releases/latest/download/latest.json`)와 공개 키 자리를 넣고 `bundle.createUpdaterArtifacts`는 기본 설정에 넣지 않는다(켜면 서명 키 없는 `task bundle`·`task install`이 실패한다 — 릴리스 빌드에서만 3of3가 `--config` 덮어쓰기로 켠다). 권한(capabilities)과 `Backend` 인터페이스(`backend.ts` → `tauri.ts` → `fake.ts`)까지 연결하고 `task gen-types`를 돌린다.
- 공개 키 자리: 사용자가 실제 키를 줄 때까지 `REPLACE_WITH_UPDATER_PUBKEY`를 둔다(검사 C7이 이 자리가 남아 있는 동안 대기).
- Non-goals: UI(2of3), 릴리스 스크립트·latest.json 생성(3of3), 서명 키 생성, 시작 시 자동 확인.

## Source of truth
- Glossary terms: none
- Related ADRs: `docs/adr/0003-in-process-ipc.md`(command 구조), `0011-specta-pinned-versions.md`(생성 파일)
- 이슈 추적: GitHub 이슈 #10
- Definition of Done:
  1. `cargo build -p twin-deck-desktop`, `cargo clippy -p twin-deck-desktop -- -D warnings` 종료 코드 0.
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과. `grep -c "checkUpdate\|installUpdate" packages/ts-client/src/generated/bindings.ts` ≥ 2.
  3. `apps/desktop/src-tauri/tauri.conf.json`이 JSON으로 파싱되고(`bun -e 'JSON.parse(require("fs").readFileSync("apps/desktop/src-tauri/tauri.conf.json","utf8"))'`) `plugins.updater.endpoints[0]`이 위 URL이며 `bundle.createUpdaterArtifacts`는 기본 설정에서 켜져 있지 않다(키 없는 로컬 번들이 깨지지 않게) — 위 명령으로 값을 읽어 단언.
  4. `FakeBackend`가 새 버전 있음/없음/오류/설치 호출을 시험에서 시나리오로 정할 수 있다(`fake.ts`에 시나리오 설정 메서드, 호출 기록) — `cd apps/desktop && bunx tsc --noEmit` 통과와 3of3 UI 테스트가 쓸 수 있음.
  5. 기존 테스트 회귀 없음: `cd apps/desktop && bunx vitest run --exclude '**/pdf-preview*'` 통과(사전 통과가 정상인 회귀 방지 항목).
  6. 플러그인이 앱 시작에서 패닉하지 않는다는 것은 GUI 없이 확인할 수 없다 — 이 한계를 run.md에 적는다(플레이스홀더 공개 키로도 플러그인 초기화는 되고, 서명 검증은 설치 시점에 한다는 Tauri 동작을 근거로).

## Work slices
- [ ] S1. `Cargo.toml`에 `tauri-plugin-updater`·(재시작용) 필요 의존성, `lib.rs` 플러그인 등록, capabilities 권한, `tauri.conf.json` 업데이터 설정 — completion criterion: DoD 1, 3
- [ ] S2. `check_update`/`install_update` command와 DTO(`UpdateInfoDto`: 버전, 노트, 날짜) — completion criterion: DoD 1, 2 (depends: S1)
- [ ] S3. `task gen-types`, `Backend`·`TauriBackend`·`FakeBackend` 확장 — completion criterion: DoD 2, 4, 5 (depends: S2)
