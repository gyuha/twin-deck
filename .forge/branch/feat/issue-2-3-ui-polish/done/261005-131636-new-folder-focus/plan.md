<!-- forge-slug: new-folder-focus -->
<!-- task: 54 -->
<!-- tdd: off -->
# F7로 새 폴더를 만들면 커서를 새 폴더로 옮긴다

## Goal / Non-goals
- Goal: `newFolder`(F7)로 폴더를 만든 뒤 활성 패널의 커서가 만든 폴더 행으로 이동하고, 목록이 길어 화면 밖이어도 보이는 위치로 스크롤된다. 중첩 경로(`a/b/c`)를 입력하면 맨 위 폴더(`a`)로 이동한다.
- Non-goals: 새 파일(`newFile`)과 이름 바꾸기의 커서 이동, 선택 상태 변경, 설정 항목 추가.
- 이슈 추적: GitHub 이슈 #3

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "새로 만든 폴더"` → 통과 1개 이상, 실패 0. 작성 시점 pre-state는 0 tests(필터가 비면 통과로 보이므로 "passed ≥ 1"까지 확인한다). 전진 검사. 테스트는 새 폴더가 정렬상 맨 아래에 놓이는 이름(`zzz`)과 항목이 많은 목록을 쓰고, 커서 행의 이름이 새 폴더인지를 단언한다.
  2. `cd apps/desktop && bunx tsc --noEmit` 통과. 회귀 방지 검사로 작업 전에도 통과한다.

## Work slices
- [ ] S1. `store.ts`의 `newFolder`가 `reloadAll()` 뒤에 새 폴더를 찾아 `setCursor`로 커서를 옮기고 보이게 스크롤한다 — completion criterion: DoD 1
