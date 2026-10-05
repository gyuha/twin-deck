<!-- forge-slug: context-menu-extract -->
<!-- task: 61 -->
<!-- tdd: off -->
# 컨텍스트 메뉴에 "압축 풀기"를 넣는다(압축 파일에서만 켜짐)

## Goal / Non-goals
- Goal: 파일 컨텍스트 메뉴(오른쪽 클릭)에 "압축 풀기"(`core.extract`)가 보이고, 커서 항목이 압축 파일일 때만 켜진다. 일반 파일·폴더에서는 비활성(흐림)이다. 클릭하면 압축 파일 옆의 새 폴더로 풀린다.
- Non-goals: "반대편 패널로 추출" 메뉴 항목, 메뉴 구조 변경, 키 변경.
- 이슈 추적: GitHub 이슈 #9

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "컨텍스트 메뉴 압축 풀기"` → 통과 ≥ 1, 실패 0. 압축 파일 위에서 항목이 활성이고 클릭하면 추출 작업이 만들어지는지, 일반 파일에서는 비활성인지 단언한다. 전진 검사.
  2. 기존 컨텍스트 메뉴·액션 테스트와 `tsc`가 통과한다(회귀 방지).

## Work slices
- [ ] S1. `ActionContext`에 커서가 압축 파일인지(`cursorIsArchive`)를 더하고 `core.extract`의 `isApplicable`을 압축 파일 대상으로 좁힌다 — completion criterion: DoD 1(비활성 부분)
- [ ] S2. `CONTEXT_MENU`에 "압축 풀기" 항목을 추가한다 — completion criterion: DoD 1(활성·클릭 부분) (depends: S1)
