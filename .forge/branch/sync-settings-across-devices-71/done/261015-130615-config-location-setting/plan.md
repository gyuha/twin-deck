<!-- forge-slug: config-location-setting -->
<!-- task: 165 -->
<!-- priority: high -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# 설정 파일 저장 경로를 사용자가 지정한다 (이슈 #71)

## Goal / Non-goals
- Goal: `config.toml`·`keybindings.toml`을 둘 폴더를 설정 화면에서 바꿀 수 있게 한다. iCloud Drive·Google Drive 폴더를 고르면 여러 맥이 같은 설정을 쓴다. 바꾸면 앱을 다시 시작하지 않아도 새 경로의 설정이 바로 적용된다.
- Non-goals: 키별 병합·기기별 파일·충돌 해결 같은 동기화 로직, 클라우드 API 연동, `state.json` 이동, 내보내기·가져오기(task 166).

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0006-toml-config.md
- Definition of Done:
  1. `cargo test -p td-config`가 통과하고, 경로 해석 테스트(포인터 파일 없음 → 로컬 폴더, 포인터에 경로 있음 → 그 경로, 포인터 경로가 사라짐 → 로컬 폴더로 돌아가고 경고)가 실제 경로 값을 단언한다. `--list`에 `location`이 들어간 테스트가 2개 이상 있다.
  2. `cargo test -p twin-deck-desktop`가 통과한다(`up_to_date` 포함). 서비스 테스트(`config_location` 이름 포함)가 다음 세 경우를 시험한다: 빈 폴더로 바꾸면 현재 두 파일이 복사되고 포인터가 갱신됨, 기존 config.toml이 있는 폴더에서 "덮어쓰기"를 고르면 기존 파일이 `.bak`으로 남음, "그 경로 사용"을 고르면 그 내용이 로드됨.
  3. `state.json` 저장·복원은 경로를 바꿔도 로컬 앱 설정 폴더를 쓴다. 테스트로 확인한다.
  4. `single_instance_enabled()`(Tauri가 뜨기 전에 설정을 읽는 곳)도 포인터를 따른다.
  5. 설정 화면에 현재 저장 경로 표시, "경로 바꾸기…"(폴더 선택 창), "기본 위치로 되돌리기"가 있고, 기존 파일 충돌 시 store의 `ask()` 대화상자가 뜬다. vitest가 FakeBackend로 이 흐름을 시험하고, 테스트 파일에 "저장 경로"라는 문구가 있다. ko·en 사전에 문구가 모두 있다.
  6. `bunx tsc --noEmit`, `cargo clippy -p td-config -p twin-deck-desktop -- -D warnings`, `cargo fmt --all --check`가 통과한다.
  7. `docs/06-config-plugins.md`에 `## … 저장 경로` 제목의 절이 있다(포인터 파일 위치, state.json은 로컬에 남는다는 점, iCloud 저장 공간 최적화나 두 기기 동시 편집 시 충돌 사본이 생길 수 있다는 한계). 설정 위치 표(15~17행 근처)에 "지정하면 그 경로" 안내를 덧붙인다.

## Work slices
- [ ] S1. td-config: 포인터 파일(로컬 앱 설정 폴더의 `location.toml`, 키 `dir`)을 읽고 쓰는 `resolve_config_dir(local) -> (PathBuf, Option<Warning>)`·`set_config_location`·`clear_config_location` 추가. 경로가 없거나 폴더가 아니면 로컬로 돌아가고 경고한다. — 완료 기준: DoD 1
- [ ] S2. 앱(src-tauri): `ConfigState`가 로컬 폴더(state 저장용)와 설정 폴더를 분리해 들고, `ConfigStore`를 실행 중에 바꿀 수 있게 한다(Mutex 등). 시작할 때와 `single_instance_enabled`가 포인터를 따른다. 명령 `get_config_location`, `set_config_location(dir, on_conflict)`(충돌 여부를 먼저 알려 주는 `inspect`류 포함 가능), `reset_config_location`을 추가하고, 바꾼 뒤 새 Loaded를 돌려주며 `ConfigChanged`를 보낸다. 감시 스레드는 새 store 것으로 바꾼다. `task gen-types`. — 완료 기준: DoD 2·3·4 (depends: S1)
- [ ] S3. ts-client: `backend.ts`·`tauri.ts`·`fake.ts`에 위 기능 추가. 폴더 선택은 `tauri-plugin-dialog`(Rust·JS 의존성과 capabilities 권한 추가)로 하고 Backend에 `pickFolder()`를 둔다(Fake는 미리 정한 값을 돌려줌). — 완료 기준: tsc 통과, fake로 vitest 가능 (depends: S2)
- [ ] S4. UI: 설정 화면 일반(또는 환경) 섹션에 저장 경로 행 추가, 충돌 시 `ask()`, i18n ko·en, vitest 테스트. — 완료 기준: DoD 5 (depends: S3)
- [ ] S5. 문서: docs/06에 저장 경로 절 추가. — 완료 기준: DoD 7
