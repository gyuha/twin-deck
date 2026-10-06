<!-- forge-slug: preview-window-state-1of2 -->
<!-- task: 68 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 미리보기 창 이동·크기 조절 (1/2): 위치·크기를 state.json에 저장하는 상태

## Goal / Non-goals
- Goal: 미리보기 창의 위치·크기를 앱을 종료해도 이어지게 저장할 수 있게 한다. `td-state`의 `Snapshot`에 `preview_rect: Option<PreviewRect>`(`x`, `y`, `w`, `h` 픽셀, 모두 `u32`)를 `#[serde(default)]`로 더해, 필드가 없는 옛 저장 파일도 그대로 읽히고(`None` = 기본 크기·가운데) 저장 형식 버전은 올리지 않는다. 바인딩을 다시 만들고, 스토어가 `previewRect` 상태를 갖고 `toSnapshot`으로 저장·시작 시 `Snapshot`에서 복원한다(값이 없으면 `null`).
- Non-goals: 이동·크기 조절 UI(2/2에서 한다), 창 밖으로 나가는 위치 보정·최소 크기 같은 규칙(2/2), 창마다 다른 값(창 하나의 값 하나), 새 설정 키.
- 이슈 추적: GitHub 이슈 #11

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cargo test -p td-state preview_rect` → 통과 ≥ 1, 실패 0. 저장 후 읽으면 같은 값이 돌아오는지, `previewRect` 필드가 없는 옛 JSON도 `None`으로 읽히는지, 값이 있을 때와 없을 때 모두 저장 가능한지 단언한다. 작성 시점 pre-state: 0 tests(`running 0 tests`가 초록으로 보이니 "passed ≥ 1"까지 확인). 전진 검사.
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과, `bindings.ts`에 `previewRect`와 `PreviewRect`가 생긴다. 전진 검사.
  3. `cd apps/desktop && bunx vitest run src/__tests__ -t "미리보기 창 상태 저장"` → 통과 ≥ 1, 실패 0. 스토어의 스냅샷이 `previewRect`(없으면 null)를 담는지, 스냅샷의 값으로 시작하면 스토어 상태가 그 값인지, 상태 저장 호출이 값을 담아 나가는지 단언한다. 전진 검사(작성 시점 0 tests).
  4. `cargo clippy -p td-state -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`, `bunx tsc --noEmit`, `cargo test -p td-state -p twin-deck-desktop`, 전체 `bunx vitest run`(실패는 기준선 `pdf-preview` 1건뿐)이 통과한다. 회귀 방지 검사로 작업 전에도 같다.

## Work slices
- [ ] S1. `td-state`에 `PreviewRect`와 `Snapshot.preview_rect`(serde default)를 더하고 저장·읽기·옛 파일 호환 테스트를 쓴다 — completion criterion: DoD 1
- [ ] S2. `task gen-types`, 스토어 `previewRect` 상태와 `toSnapshot`·복원 연결(값이 없으면 null) — completion criterion: DoD 2, 3 (depends: S1)
