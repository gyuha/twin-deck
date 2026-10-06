<!-- forge-slug: folder-symlink-enter -->
<!-- task: 67 -->
<!-- tdd: on -->
# 폴더를 가리키는 심볼릭 링크로 Enter·오른쪽 클릭 열기·→로 들어간다

## Goal / Non-goals
- Goal: 항목 DTO(`EntryDto`)에 "심볼릭 링크의 대상이 폴더인지"(`linkIsDir`)를 더하고(브리지에서 링크일 때만 `std::fs::metadata`로 대상을 따라가 판정), UI의 폴더 들어가기 경로(`Enter`·더블클릭의 `open`, 오른쪽 클릭 "열기", 패널에서 `→`)가 폴더 링크를 폴더처럼 취급한다. 들어갈 때의 경로는 링크 경로 그대로다(경로 표시줄에 링크 이름이 남는다). 파일을 가리키는 링크와 끊어진 링크는 들어가지 않는다(지금과 같다).
- Non-goals: 파일을 가리키는 링크를 `Enter`로 여는 것, 복사·삭제 등 파일 작업에서 링크를 다루는 방식 변경, 링크 아이콘·정렬(폴더 먼저) 변경, 아카이브 안의 링크.
- 이슈 추적: GitHub 이슈 #13

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cargo test -p twin-deck-desktop link_is_dir` → 통과 ≥ 1, 실패 0. 폴더를 가리키는 링크는 `linkIsDir == true`, 파일을 가리키는 링크·끊어진 링크·일반 폴더·일반 파일은 false임을 단언한다(unix `cfg`). 작성 시점 pre-state: 0 tests(`running 0 tests`가 초록으로 보이니 "passed ≥ 1"까지 확인). 전진 검사.
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과, `bindings.ts`에 `linkIsDir`가 생긴다. 전진 검사.
  3. `cd apps/desktop && bunx vitest run src/__tests__ -t "폴더 심볼릭 링크"` → 통과 ≥ 1, 실패 0. 폴더 링크에서 `Enter`·더블클릭·오른쪽 클릭 "열기"·`→`로 링크 경로로 들어가는지, 파일 링크와 끊어진 링크는 들어가지 않는지, 일반 폴더는 그대로인지 단언한다. 작성 시점 pre-state: 0 tests. 전진 검사(일반 폴더·파일 링크 테스트는 회귀 방지).
  4. `bunx tsc --noEmit`, 전체 `bunx vitest run`(실패는 기준선 `pdf-preview` 1건뿐), `cargo test -p twin-deck-desktop`, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`가 통과한다. 회귀 방지 검사로 작업 전에도 같다.

## Work slices
- [ ] S1. `EntryDto`에 `link_is_dir`(serde camelCase `linkIsDir`)를 더하고 `From<&Entry>`에서 링크일 때만 대상 폴더 여부를 판정한다. `task gen-types`, `fake.ts`가 링크 항목을 만들 수 있게 한다 — completion criterion: DoD 1, 2
- [ ] S2. 폴더 들어가기 경로를 폴더 링크에도 적용한다: `open()`, 오른쪽 클릭 메뉴 "열기"(`cursorIsDir` 컨텍스트 포함), 패널의 `→` 분기, 더블클릭 — completion criterion: DoD 3 (depends: S1)
