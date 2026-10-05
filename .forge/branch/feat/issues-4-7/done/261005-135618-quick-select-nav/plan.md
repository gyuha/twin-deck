<!-- forge-slug: quick-select-nav -->
<!-- task: 56 -->
<!-- tdd: off -->
# 빠른 선택 중 ↑↓는 일치한 행 사이를 움직이고, Enter는 그 행을 실행한다

## Goal / Non-goals
- Goal: 빠른 선택(Quick Select) 입력 중 `↑`/`↓`는 입력한 글자와 일치하는 행들 사이에서만 커서를 옮긴다(끝에서는 멈춘다, 순환하지 않는다). `Return`은 빠른 선택을 끝내고 커서 행을 연다(폴더면 들어가고 파일이면 기본 열기). `Esc`는 지금처럼 취소만 한다.
- Non-goals: 일치 항목 순환, 새 설정 키, 빠른 선택 시작 키 변경, 다중 선택 동작 변경.
- 이슈 추적: GitHub 이슈 #4

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "빠른 선택 이동"` → 통과 ≥ 1, 실패 0. 일치하지 않는 행(`b.txt`)을 건너뛰고 일치 행(`a.txt` → `ab.txt`)만 오가는지, 끝에서 멈추는지 단언한다. 전진 검사(작성 시점 0 tests).
  2. `cd apps/desktop && bunx vitest run src/__tests__ -t "빠른 선택 실행"` → 통과 ≥ 1, 실패 0. Return이 폴더로 들어가고 빠른 선택이 끝나는지, 파일이면 열기 액션이 호출되는지 단언한다. 전진 검사.
  3. `bunx tsc --noEmit` 통과, 기존 빠른 선택 테스트가 그대로 통과(회귀 방지).

## Work slices
- [ ] S1. 빠른 선택 중 `↑`/`↓` 처리(스토어 + `useKeyboard`)를 일치 행 사이 이동으로 바꾼다 — completion criterion: DoD 1
- [ ] S2. `quickAccept`가 빠른 선택을 끝낸 뒤 커서 행을 연다 — completion criterion: DoD 2 (depends: S1)
- [ ] S3. `docs/05-actions-keybindings.md`의 빠른 선택 설명을 새 동작으로 고친다 — completion criterion: 문서에 "일치" 이동과 Return 실행이 적혀 있다
