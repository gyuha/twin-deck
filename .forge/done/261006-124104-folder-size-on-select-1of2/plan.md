<!-- forge-slug: folder-size-on-select-1of2 -->
<!-- task: 65 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 선택한 폴더 용량 계산 (1/2): 백엔드 명령, 설정 키, 타입 연결

## Goal / Non-goals
- Goal: 폴더 하나의 하위 총 용량을 구하는 백엔드를 만든다. 새 명령 `dir_size(path)`(취소는 `cancel_dir_size(path)`)는 기존 `td_search::disk_usage`를 재사용해 숨김 파일을 포함하고, 하드 링크는 한 번만, 심볼릭 링크는 따라가지 않고, 볼륨 경계는 넘지 않는다. 취소하면 계산을 멈추고 결과 없음(`None`)을 돌려준다. 설정 키 `display.folder_size_on_select`(bool, 기본 true)를 `td-config`와 `default.toml`에 더하고, `Backend` 인터페이스 → `tauri.ts` → `fake.ts`까지 연결한다(`FakeBackend`는 메모리 파일 트리의 파일 크기 합).
- Non-goals: UI(크기 표시, 상태 줄 합산, 설정 화면 스위치, 캐시·큐)는 2/2에서 한다. 압축 파일 안·가상 탭의 폴더 용량, 바이트 단위 진행률.
- 이슈 추적: 없음(사용자 직접 요청)

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cargo test -p twin-deck-desktop dir_size` → 통과 ≥ 1, 실패 0. 중첩 폴더·숨김 파일·하드 링크 한 번 계산, 심볼릭 링크 미추적, 취소 시 `None`, 없는 경로는 오류를 단언한다. 작성 시점 pre-state: 0 tests(`running 0 tests`가 초록으로 보이니 "passed ≥ 1"까지 확인). 전진 검사.
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과, `bindings.ts`에 `dirSize`/`cancelDirSize`와 `folderSizeOnSelect`가 생긴다. 전진 검사(생성 전에는 `up_to_date`가 실패하거나 키가 없다).
  3. `cargo test -p td-config` 통과: `folder_size_on_select`의 기본값이 true이고 사용자 설정으로 덮어쓸 수 있다. 전진 검사(새 테스트 포함 ≥ 1).
  4. `cd apps/desktop && bunx vitest run -t "FakeBackend 폴더 용량"` → 통과 ≥ 1: `fake.ts`의 `dirSize`가 하위 파일 크기를 더하고 취소하면 `null`이다. 전진 검사.
  5. `cargo clippy -p td-search -p td-config -p twin-deck-desktop -- -D warnings`, `bunx tsc --noEmit`, 전체 `bunx vitest run`(실패는 기준선 `pdf-preview` 1건뿐)이 통과한다. 회귀 방지 검사로 작업 전에도 같다.

## Work slices
- [ ] S1. `td-config`에 `display.folder_size_on_select`(기본 true)를 더한다(`config.rs`, `default.toml`, 검증·테스트) — completion criterion: DoD 3
- [ ] S2. `Service::dir_size`/`cancel_dir_size`와 `commands.rs` 래퍼를 만들고 `disk_usage`를 재사용한다 — completion criterion: DoD 1 (depends: S1)
- [ ] S3. `task gen-types`, `backend.ts`·`tauri.ts`·`fake.ts` 연결 — completion criterion: DoD 2, 4 (depends: S2)
