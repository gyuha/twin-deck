<!-- forge-slug: favorites-local-only -->
<!-- task: 202 -->
<!-- tdd: on -->
# 즐겨찾기를 로컬 전용 파일로 분리해 설정 동기화에서 뺀다 (이슈 #106)

## Goal / Non-goals
- Goal: 설정 저장 경로(동기화 폴더)를 지정해도 PC 종속 정보인 즐겨찾기가 다른 PC로 번지지 않게 한다. 즐겨찾기를 `config.toml`의 `[[favorites]]`가 아니라 **항상 로컬(기본 위치)의 `favorites.toml`**에 두고, 최근 위치(`state.json`)는 이미 로컬에만 있음을 시험으로 보증한다.
- Non-goals:
  - 글꼴, `text_editor`, `terminal`, `[remote_server]`(`root`/`bind`/`port`)처럼 `config.toml`에 남아 있는 다른 PC 종속 값은 이번에 옮기지 않는다(사용자가 즐겨찾기와 최근 목록으로 한정했다).
  - 폴더 단축키(`Ctrl+0~9`)가 경로를 담고 있다면 그것도 이번 범위 밖이다(위 확인 결과를 run.md에 적는다).
  - 설정 내보내기·가져오기(`config.toml`·`keybindings.toml`만 묶는다)는 그대로 둔다. 즐겨찾기는 PC 전용이라 내보내기에 넣지 않는다.
  - `config.toml`에 남은 `[[favorites]]`를 지우거나 고치지 않는다(다른 PC가 아직 옛 버전일 수 있다). 마이그레이션 뒤에는 무시할 뿐이다.
  - 즐겨찾기 형식(`[[favorites]]` 항목·`type = "separator"`·`group`)과 `FavoriteDto`는 바꾸지 않으므로 `task gen-types` 산출물은 바뀌지 않는다.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0018-smb-via-os-mount.md (설정 파일이 #71로 내보내기·동기화 대상이 되었다는 문장). 설정 저장 경로: docs/06-config-plugins.md 2.1
- 결정(이슈 #106 인터뷰): ① 범위는 즐겨찾기(+이미 로컬인 최근 위치) ② 저장은 항상 로컬 `favorites.toml` ③ 마이그레이션은 `favorites.toml`이 없을 때 `config.toml`의 `[[favorites]]`를 한 번 복사하고 `config.toml`은 건드리지 않는다. 이후 `config.toml`의 `[[favorites]]`는 무시한다 ④ 로컬 `favorites.toml` 변경도 감시한다 ⑤ 내보내기·가져오기는 그대로다.
- Definition of Done:
  1. 새 시험이 있고 통과한다: `cargo test -p td-config favorites_local -- --list 2>&1 | grep -c ': test'` → `≥4` (pre-state `0`: 아직 시험이 없다. 시험 먼저 쓰므로 빨강 → 초록을 run.md에 기록한다).
  2. `cargo test -p td-config` 와 `cargo test -p twin-deck-desktop favorites` 가 통과한다(후자는 새 시험이 하나 이상 걸려야 한다: `cargo test -p twin-deck-desktop favorites -- --list 2>&1 | grep -c ': test'` → `≥1`, pre-state `0`).
  3. 동기화 폴더를 지정한 상태에서 즐겨찾기를 추가하면 지정 폴더의 `config.toml`은 바뀌지 않고 로컬 `favorites.toml`에만 쓰인다 — 슬라이스 S3의 시험이 이를 단정한다(내용 비교, 문자열 존재 확인이 아니라 두 파일을 실제로 읽어 비교).
  4. `bun run test`(apps/desktop)와 `bunx tsc --noEmit`이 통과한다. (프런트 코드는 바뀌지 않아야 한다: `git diff --stat -- apps/desktop/src | tail -1` → 빈 출력 또는 문서가 아닌 변경 없음.)
  5. 문서 사이트(찾는 명령 `git grep -n 'favorites' -- docs README.md README.en.md ':!docs/adr'` 를 승격 시 다시 돌려 목록을 확인한다). 아래가 모두 `favorites.toml`과 PC 전용·동기화 제외를 설명한다: `docs/06-config-plugins.md`(2절 파일 표, 2.1의 "경로를 따라가는 파일" 목록, 4.1 즐겨찾기), `README.md`·`README.en.md`(빨리 가기 항목, 한/영 쌍). `docs/01-feature-spec.md` NAV-08은 "설정 파일과 UI 편집"을 `favorites.toml`로 고친다. pre-state: `git grep -c 'favorites.toml' -- docs README.md README.en.md` → 파일 없음(0건).
- 이미 통과하는 항목 없음. 최근 위치 보증 시험(S4)은 회귀 방지용이라 시험을 쓰는 즉시 통과한다(구현 변경 없이 통과해야 정상이다. 한 줄 이유: `state.json`은 원래 `local_dir`에만 쓴다).

## Work slices
- [ ] S1. `td-config`가 즐겨찾기를 로컬 `favorites.toml`에서 읽는다 — `ConfigStore::start`가 설정 폴더와 별개로 로컬 폴더(`favorites.toml`이 있는 곳)를 받고, `load_dir`가 `[[favorites]]`를 `config.toml`이 아니라 그 파일에서 파싱한다(형식·검증·경고는 `parse_favorites` 그대로). 없으면 `config.toml`의 `[[favorites]]`를 한 번 `favorites.toml`로 복사한다(`config.toml`은 수정하지 않는다). 파일이 생긴 뒤에는 `config.toml`의 `[[favorites]]`를 무시한다. 감시 서명(`signature`)과 감시 폴더에 로컬 폴더의 `favorites.toml`을 더해, 직접 고쳐도 반영된다. — completion criterion: 시험 `favorites_local_*`가 먼저 실패했다가 통과한다 — (a) `favorites.toml`의 항목이 `Config.favorites`가 된다 (b) `favorites.toml`이 있으면 `config.toml`의 `[[favorites]]`는 무시된다 (c) 없으면 `config.toml`의 항목이 `favorites.toml`로 복사되고 `config.toml` 바이트는 그대로다 (d) 설정 폴더와 로컬 폴더가 다를 때 로컬 `favorites.toml`을 고치면 `refresh`/감시로 반영된다 (e) 문법 오류는 `favorites.toml` 경고로 나오고 이전 유효 목록을 유지한다
- [ ] S2. `append_favorite`·`remove_favorite`가 로컬 `favorites.toml`을 고친다 — 둘 다 먼저 마이그레이션(S1)을 보장한 뒤 `favorites.toml`에 쓴다. 주석·기존 내용을 보존하는 지금 방식(문서 편집)을 그대로 쓰고, 오류 문구는 `favorites.toml` 기준으로 바꾼다. — completion criterion: 시험 `favorites_local_append_*`·`favorites_local_remove_*`가 통과한다 — 추가·삭제·그룹 안 삭제가 `favorites.toml`에만 일어나고 `config.toml`은 그대로이며, 옛 `config.toml`에만 즐겨찾기가 있던 PC에서 첫 추가가 기존 항목을 잃지 않는다 (depends: S1)
- [ ] S3. 브리지(`apps/desktop/src-tauri`)가 로컬 폴더를 넘긴다 — `ConfigState::open`·설정 저장 경로 변경 경로가 `ConfigStore`에 `local_dir`을 넘기고, `add_favorite`·`remove_favorite` 명령이 설정 폴더가 아니라 로컬 폴더로 일한다. 저장 경로를 바꾸거나 "기본 위치로" 돌아가도 `favorites.toml`은 로컬에 남고 지정 폴더로 복사되지 않는다(`CONFIG_FILES`는 `config.toml`·`keybindings.toml` 그대로). — completion criterion: `cargo test -p twin-deck-desktop favorites`의 시험이 통과한다 — 지정 폴더(임시 폴더 두 개)를 쓰는 상태에서 즐겨찾기를 추가하면 지정 폴더의 `config.toml`은 바이트가 그대로이고 로컬 `favorites.toml`에 항목이 생기며, 저장 경로를 바꾸고 되돌려도 즐겨찾기가 유지된다 (depends: S1, S2)
- [ ] S4. 최근 위치·상태가 동기화되지 않음을 시험으로 보증한다 — `change_config_location`(복사·덮어쓰기·되돌리기)이 `state.json`·`favorites.toml`을 지정 폴더로 옮기지 않는다. — completion criterion: 시험 `favorites_local_not_synced`가 통과한다 — 임시 로컬 폴더에 `state.json`(최근 목록 포함)과 `favorites.toml`을 두고 저장 경로를 바꾼 뒤 지정 폴더에 두 파일이 없다 (depends: S1)
- [ ] S5. 문서 갱신 — DoD 5의 사이트를 모두 고친다. — completion criterion: DoD 5의 finder 결과 각 사이트가 새 설명을 담는다 (depends: S1, S2, S3)
