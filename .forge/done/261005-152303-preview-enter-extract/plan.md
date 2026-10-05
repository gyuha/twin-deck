<!-- forge-slug: preview-enter-extract -->
<!-- task: 62 -->
<!-- tdd: off -->
# 압축 파일 미리보기에서 Enter를 누르면 압축을 푼다

## Goal / Non-goals
- Goal: 미리보기가 압축 파일(`td-archive`가 여는 형식)일 때 `Return`은 미리보기를 닫고 압축 풀기(`core.extract`와 같은 동작: 압축 파일 옆의 새 폴더로)를 실행한다. 그 밖의 파일의 `Return`(미리보기 닫고 열기)은 그대로다. 미리보기 창 안에 `Enter: 압축 풀기` 안내를 보인다.
- Non-goals: 풀 위치 선택 창, 새 키 바인딩, 미리보기 내용 변경.
- 이슈 추적: GitHub 이슈 #9

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "압축 파일 미리보기 Enter"` → 통과 ≥ 1, 실패 0. 압축 파일 미리보기에서 Return을 누르면 미리보기가 닫히고 추출 작업이 만들어지는지, 일반 텍스트 파일의 Return은 이전처럼 열기인지 단언한다. 전진 검사.
  2. `docs/05-actions-keybindings.md`의 `core.preview.open` 설명에 압축 파일이면 추출한다는 내용이 있다(`grep -n "압축 풀기\|추출" docs/05-actions-keybindings.md | grep -c "preview.open"` ≥ 1). 전진 검사.
  3. 기존 미리보기 테스트와 `tsc`가 통과한다(회귀 방지).

## Work slices
- [ ] S1. `core.preview.open` 핸들러가 압축 파일이면 닫고 `extract`를 부른다 — completion criterion: DoD 1
- [ ] S2. 미리보기 창에 안내를 보이고 `docs/05`를 고친다 — completion criterion: DoD 2 (depends: S1)
