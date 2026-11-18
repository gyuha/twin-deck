<!-- forge-slug: shortcut-editor-1of2 -->
<!-- task: 214 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 단축키 편집 백엔드: keybindings.toml 쓰기와 fkeys 이전

## 목표
UI가 `keybindings.toml`의 항목 하나를 주석·순서를 보존한 채 쓰고 지울 수 있게 하고, `config.toml`의 `fkeys`를 `keybindings.toml`로 한 번 옮겨 단축키 저장소를 하나로 만든다.

## 진실의 원천
- 결정(이 그릴링): 단축키 저장소는 `keybindings.toml` 하나. `config.toml`에는 F키 고유 정보(`fkey_bar`, `fkey_apps`)와 `global_hotkey`만 남는다.
- UI 쓰기는 `toml_edit`로 해당 항목만, **현재 OS 섹션**(`[keybindings.macos|windows|linux]`)에 쓴다.
- `fkeys` 이전은 **공통 섹션**에 쓰고, 같은 키가 이미 있으면 기존 값 유지(현재 `App.tsx:298`에서 toml이 이기므로 동작 불변). 이전 후 `config.toml`에서 `fkeys` 삭제, 스키마에서 `fkeys` 제거.
- 기존 로더: `crates/td-config/src/keybindings.rs`(공통 뒤 OS 섹션, 나중 정의가 이김).

## 슬라이스
- [ ] S1. td-config: `keybindings.toml` 항목 쓰기/지우기 함수(`toml_edit`, OS 섹션, 파일 없으면 생성) — 완료 기준: 주석·다른 항목 보존, 다른 OS 섹션 불변을 확인하는 단위 테스트 통과.
- [ ] S2. td-config: `fkeys` → 공통 섹션 이전(멱등, 기존 키 우선) — 완료 기준: 이전 후 두 번째 실행이 아무것도 바꾸지 않는 테스트, 충돌 시 기존 값 유지 테스트 통과.
- [ ] S3. 시작 시 이전 호출 + `fkeys` 스키마 제거 + Tauri 명령 추가(`set_keybinding`/`reset_keybinding` 류) → `task gen-types` → `backend.ts`·`tauri.ts`·`fake.ts` — 완료 기준: `up_to_date` 테스트 통과, `fkeyBindings` 경로 제거 후 기존 F키 동작 테스트가 keybindings 경로로 통과.

## 완료 정의
- `cargo test -p td-config` 통과 (사전 상태: 통과, 회귀 가드).
- `cargo test -p twin-deck-desktop up_to_date` 통과.
- `cargo clippy -p td-config -- -D warnings` 통과.
- `cd apps/desktop && bunx tsc --noEmit && bunx vitest run` 통과.
- `grep -n "pub fkeys" crates/td-config/src/config.rs` 결과 없음 (전진 검사, 사전 상태: 걸림).

## 하지 않을 것
- 설정 UI(2/2에서).
- 이미 공개된 릴리스·CHANGELOG 작성(배포 시점에 `### 변경`으로 기록).

## 관련 ADR
- 없음
