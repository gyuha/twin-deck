<!-- forge-slug: preview-forward-enter-folder -->
<!-- task: 63 -->
<!-- tdd: on -->
# 미리보기에서 폴더 위의 →는 폴더 안으로 들어가 첫 항목을 미리본다

## Goal / Non-goals
- Goal: 미리보기 중인 항목이 폴더일 때 `→`(새 액션 `core.preview.forward`)를 누르면 그 폴더로 들어가고(`navigate`), 미리보기는 열린 채 폴더 안 첫 항목을 보여 준다. 안에 항목이 하나도 없으면 미리보기를 닫는다(빈 폴더 목록이 보인다). 폴더 안에 하위 폴더만 있으면 첫 하위 폴더를 미리보기로 이어 간다. 파일 위의 `→`는 이전처럼 다음 항목이고, `↓`는 폴더 위에서도 다음 항목(`core.preview.next`)이다.
- Non-goals: `←`의 의미 변경(계속 미리보기 닫기), 압축 파일 안으로 들어가기, 되돌아 나오는 새 키, 새 설정 키.
- 이슈 추적: 없음(사용자 직접 요청)

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "미리보기 폴더 진입"` → 통과 ≥ 1, 실패 0. 폴더 미리보기에서 `→`가 폴더로 들어가 첫 항목을 미리보는지, 빈 폴더면 미리보기가 닫히는지, 폴더 위 `↓`는 다음 항목인지, 파일 위 `→`는 다음 항목인지(회귀 방지)를 단언한다. 작성 시점 pre-state: 0 tests(`634 skipped`로 필터가 비면 통과로 보이니 "passed ≥ 1"까지 확인). 전진 검사. 파일 위 `→` 테스트는 구현 전에도 통과하는 회귀 방지 검사다.
  2. `cd apps/desktop && bunx tsc --noEmit` 통과. 회귀 방지 검사로 작업 전에도 통과한다(pre-state 통과).
  3. `grep -c "core.preview.forward" docs/05-actions-keybindings.md` ≥ 1. 작성 시점 pre-state 0, 전진 검사.
  4. 전체 `bunx vitest run`의 실패는 기준선 `pdf-preview` 1건뿐이다(회귀 방지, 작업 전과 같다).

## Work slices
- [ ] S1. `defaults.ts`에 `core.preview.forward` 액션을 추가하고 `→`를 `core.preview.next`에서 옮긴다(`↓`는 그대로) — completion criterion: DoD 1(키 부분)
- [ ] S2. 스토어에 `previewForward()`를 추가한다: 커서 항목이 폴더면 `navigate` 후 첫 항목 `loadPreview`(없으면 `previewClose`), 아니면 `previewMove(1)`. `actions.ts`에 핸들러를 연결한다 — completion criterion: DoD 1 (depends: S1)
- [ ] S3. `docs/05-actions-keybindings.md`에 새 액션 행을 더하고 `core.preview.next`의 키 설명을 `↓`로 고친다 — completion criterion: DoD 3 (depends: S1)
