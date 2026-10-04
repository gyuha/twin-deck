<!-- forge-slug: drag-badge-pointer-drag -->
<!-- task: 49 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# 드래그 표시(+/−): 앱이 마우스 이벤트로 직접 드래그 처리

## Goal / Non-goals
- Goal: 브라우저(HTML5) 드래그를 버리고 마우스 이벤트로 드래그를 직접 처리한다. 행에서 마우스를 누른 채 5px 이상 움직이면 드래그가 시작되고, 커서 옆에 앱이 그리는 표시(`+` 복사 / Ctrl이 눌려 있는 동안 `−` 이동 + 항목 수·이름)가 따라다닌다. 놓으면 기존 `dropTransfer`로 복사/이동한다. 폴더 행 강조, 같은 패널 빈 곳 무시, 자기 하위 폴더 금지, 가상 탭 금지, 충돌 창은 지금과 같다. Esc나 창 포커스 이탈로 취소한다. 이전에 넣은 `is_ctrl_down`·`isCtrlDown`·`dragDropEnabled: false`·`draggable`은 걷어 낸다.
- Non-goals: 외부 파일 드래그, 탭 순서 바꾸기, 자동 스크롤, 폴더 위 머물면 열기.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: C1~C5(loop.md). 새 드래그 테스트 14개 이상, 실제 앱에서 복사·Ctrl 이동과 `+`/`−` 표시를 캡처로 확인, 잔재 제거, 전체 검사 통과.

## Work slices
- [ ] S1. store에 드래그 상태(`drag`: 경로들, 시작 패널, 좌표, ctrl, 대상)와 `dragPress`/`dragMove`/`dragEnd`/`dragCancel`을 두고 `dropTransfer`가 경로를 인수로 받게 한다. 이전 HTML5 드래그용 변수와 Ctrl 폴링을 지운다 — completion criterion: 단위 수준 vitest에서 시작·이동·놓기·취소가 맞다
- [ ] S2. `FileTable` 행에서 `draggable`과 HTML5 핸들러를 걷어 내고 `onMouseDown`으로 `dragPress`, 행에 `data-path`·`data-kind`를 달며, `Pane`에는 `data-pane`을 단다. 앱 수준 훅(`useDragTracking`)이 window의 mousemove/mouseup/keydown/keyup/blur와 드래그 직후 click 무시를 처리한다. `DragGhost` 컴포넌트가 `+`/`−` 표시를 그린다 — completion criterion: 다시 쓴 drag-drop.test.tsx(14개 이상)가 통과한다 (depends: S1)
- [ ] S3. `is_ctrl_down` 명령, `objc2-app-kit`의 `NSEvent` 기능, `isCtrlDown`(ts-client), `dragDropEnabled: false`를 되돌리고 바인딩을 재생성한다. 실제 앱에서 복사·Ctrl 이동·표시 캡처를 확인하고 `docs/07-ui-spec.md`를 고친다 — completion criterion: 잔재 grep이 비어 있고 `up_to_date`가 통과하며 실제 앱 확인이 맞다 (depends: S2)
