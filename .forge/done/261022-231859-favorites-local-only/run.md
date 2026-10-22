# run — 즐겨찾기를 로컬 전용 파일로 분리해 설정 동기화에서 뺀다 (이슈 #106)

TDD on. 워크플로 없이 직접 실행했다(변경이 `td-config` 한 크레이트와 브리지 한 곳이라 비용이 더 컸을 것).

## 슬라이스별 결과
- S1 `td-config`가 즐겨찾기를 로컬 `favorites.toml`에서 읽는다 — ✅ as planned (`load_dir_with_local`·`load_from_parts`·`ConfigStore::start_with_local`, 감시·서명에 로컬 파일 포함, 시작 때 한 번 복사)
- S2 `append_favorite`·`remove_favorite`가 로컬 파일을 고친다 — ✅ as planned (`*_in(config_dir, local, …)` 추가, 기존 `append_favorite(dir…)`는 두 폴더가 같은 래퍼로 남김)
- S3 브리지가 로컬 폴더를 넘긴다 — ✅ as planned (`ConfigState::{add,remove}_favorite`, `open`·`switch_location`이 `start_with_local`)
- S4 최근 위치·상태가 동기화되지 않음을 보증한다 — ✅ as planned (`favorites_local_not_synced_by_changing_the_config_location`, 구현 변경 없이 통과 — 회귀 방지용)
- S5 문서 갱신 — ✅ as planned (`docs/06` 파일 표·2.1·4.1, `docs/01` NAV-08, README 한/영)

## DoD baseline → after
1. `cargo test -p td-config favorites_local -- --list | grep -c ': test'` → 0 → **12**
2. `cargo test -p twin-deck-desktop favorites -- --list | grep -c ': test'` → 0 → **1**; `cargo test --workspace` 전부 통과
3. 동기화 폴더 지정 상태의 추가가 지정 폴더 `config.toml`을 바꾸지 않음 → 브리지 시험이 두 파일을 실제로 읽어 단정 (`favorites_local_stay_out_of_the_synced_config_dir`)
4. `bun run test` **1574 통과(1 skipped)**, `tsc` 0. 프런트 diff: `apps/desktop/src` 1파일(아래 divergence)
5. `git grep -c 'favorites.toml' -- docs README.md README.en.md | wc -l` → 0 → **4** (docs/01·docs/06·README 한/영)

이미 통과하던 항목: S4 시험(계획대로 회귀 방지용).

## 빨강 → 초록
S1·S2·S4 시험(`crates/td-config/tests/favorites_local.rs`)을 먼저 썼고 API가 없어 컴파일 단계에서 실패(빨강)했다. 구현 뒤 12개 통과. 브리지 시험도 `add_favorite`가 없어 컴파일 실패 → 통과.
변형 확인(모두 시험이 실패했고 원복했다): ① 마이그레이션 무력화 → 3개 실패 ② 로더가 `favorites.toml`을 읽지 않음 → 8개 실패 ③ 브리지가 로컬이 아닌 설정 폴더에 씀 → 브리지 시험 실패.

## 계획과 달랐던 점 (divergence)
- **`apps/desktop/src/i18n/rust.ts` 변경(계획 DoD 4는 "프런트 코드 불변").** Rust 오류 문구를 한국어 리터럴 그대로 영어로 바꾸는 대응표 시험(`i18n-rust-messages`)이 새 문구(`favorites.toml`…)와 사라진 문구(`config.toml에 문법 오류가 있어 즐겨찾기를 추가하지 않았습니다`)를 잡았다. 처음에 `format!("{file}…")`로 문구를 일반화했다가 그 시험이 잡았고, 문구를 한국어 리터럴로 되돌린 뒤 대응표에 favorites.toml 문구 3개를 추가·낡은 1개를 삭제했다. 동작 코드는 안 바뀌었다.
- **바인딩 재생성.** `add_favorite`·`remove_favorite` 문서 주석을 바꿔 `bindings.ts`의 주석이 달라졌고 `bindings_are_up_to_date`가 실패해 `task gen-types`를 돌렸다(2줄). 타입·시그니처는 그대로.
- **기존 시험 2개를 의도적으로 고쳤다**(`crates/td-config/tests/config.rs`): `remove_favorite_drops_matching_entry_and_keeps_the_rest`는 이제 `favorites.toml`을 읽고 `config.toml`이 그대로임을 단정한다. `favorite_append_refuses_and_keeps_file_when_unsafe`의 둘째 부분은 "문법 오류가 있는 config.toml"이 아니라 "문법 오류가 있는 favorites.toml"을 건드리지 않는 것으로 바꿨다(config.toml의 문법 오류는 이제 즐겨찾기 추가를 막지 않는다). 느슨하게 만든 것은 아니고 저장 위치가 바뀐 의도에 맞춘 것이다.
- 폴더 단축키(`Ctrl+0~9`) 확인: `default.toml`에 `folder_shortcut` 계열 키가 없다(grep 결과 없음). 범위 밖 판단은 그대로.

## 실제 앱에서 확인하지 못한 것
- 실제 iCloud·Google Drive 폴더에서의 동작과 앱 화면(즐겨찾기 메뉴)은 자동 시험으로만 확인했다. 시험은 임시 폴더 두 개(설정 폴더·로컬 폴더)로 흉내 낸다.
- 알려진 한계: 다른 PC가 옛 버전이면 그 PC는 계속 `config.toml`의 즐겨찾기를 쓴다. 새 버전 PC에서 `config.toml`의 `[[favorites]]`를 고쳐도 무시된다(문서에 적음).
