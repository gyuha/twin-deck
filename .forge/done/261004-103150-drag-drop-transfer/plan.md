<!-- forge-slug: drag-drop-transfer -->
<!-- task: 48 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# 드래그 & 드롭으로 복사·이동 (드래그 중 Ctrl이면 이동)

## Goal / Non-goals
- Goal: 파일 목록의 행을 끌어 다른 패널(빈 곳이면 그 패널의 현재 폴더)이나 폴더 행(안으로)에 놓으면 복사하고, 드래그 중 Ctrl을 누르고 있으면 이동한다. 선택된 항목을 끌면 선택 전체, 선택에 없는 행을 끌면 그 행만 대상이다. 확인 창 없이 기존 충돌 창과 작업 큐·진행 창을 쓴다(`runTransfer` 재사용). 드롭 가능한 폴더 행은 강조하고, 드래그 중 `dropEffect`로 복사/이동 커서를 보여 준다.
- Non-goals: Finder/탐색기와의 외부 드래그, 탭 순서 바꾸기, 자동 스크롤, 폴더 위 머물면 열기, 사용자 지정 드래그 이미지.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `drag-drop.test.tsx`(새 파일, 9개 이상)가 통과하고 실제 앱(macOS)에서 드래그 복사/Ctrl 드래그 이동이 확인된다. 전체 vitest(기존 `pdf-preview` 1건 제외)·`tsc`·`cargo test --workspace`·fmt·clippy가 통과한다.

## Work slices
- [ ] S1. store에 `dropTransfer(paths, destDir, move)`(활성 패널과 무관하게 목적 폴더 검증 `transferDestError`와 `runTransfer` 호출, 같은 폴더로의 이동·자기 하위로의 이동은 막음)를 추가한다 — completion criterion: 단위 수준 vitest에서 복사·이동·검증이 맞다
- [ ] S2. `FileTable` 행을 `draggable`로 하고 `dragstart`(선택 규칙, 데이터 전달), 폴더 행의 `dragover/dragleave/drop`(강조·`dropEffect`·Ctrl로 이동), 패널 빈 곳(`Pane`)의 드롭을 구현한다 — completion criterion: drag-drop.test.tsx의 (a)~(j)가 통과한다 (depends: S1)
- [ ] S3. 실제 앱에서 드래그 복사/Ctrl 드래그 이동을 확인하고, 앱이 DnD를 가로채면 `tauri.conf.json`의 `dragDropEnabled`를 고친다. `docs/07-ui-spec.md`에 동작을 적는다 — completion criterion: 실제 앱에서 두 경우가 맞다 (depends: S2)
