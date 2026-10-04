# RUN — 드래그 표시(+/−): 앱이 마우스 이벤트로 직접 드래그 처리 (drag-badge-pointer-drag)

워크플로 없이 직접 실행했다(작은 작업).

- S1 store: `drag` 상태, `dragPress/dragMove/dragSetCtrl/dragRelease/dragCancel/consumeDragClick/isDragActive`, `dropTransfer(paths, destDir, move)` — ✅ 계획대로
- S2 `FileTable`/`Pane`에서 HTML5 드래그 핸들러 제거, 행 `onMouseDown`과 `data-*`, `ui/DragLayer.tsx`(window 이벤트 추적과 `+`/`−` 표시), `drag-drop.test.tsx` 14개 재작성 — ✅ 계획대로
- S3 `is_ctrl_down`·`NSEvent` 기능·`isCtrlDown`·`dragDropEnabled: false` 제거, 바인딩 재생성, 문서 갱신, 실제 앱 확인 — ✅ 계획대로 (아래 확인 내용)

## DoD baseline → after
- drag-drop.test.tsx: 14개(HTML5) → 14개(마우스 이벤트 기준) 통과, vitest 전체 529 통과·실패 1(기존 `pdf-preview`), `tsc` 오류 없음
- `cargo test --workspace`·fmt·clippy·`up_to_date` 통과(`coalesce`는 병렬 실행에서 한 번 실패, 단독 재실행 통과)
- 실제 앱(격리 인스턴스, macOS) 캡처: 끄는 중 `+ one.txt`, Ctrl을 누르고 마우스를 움직이는 동안 `− two.txt`, 뗀 뒤 `+ two.txt`. 놓기: 그냥 놓으면 복사, Ctrl을 누른 채 놓으면 이동 확인
- 잔재 grep(`is_ctrl_down|isCtrlDown|dragDropEnabled|NSEvent`): 없음. `draggable`은 `FileIcon`의 `draggable={false}`(아이콘 이미지가 브라우저 드래그되지 않게 하는 기존 코드)만 남았다.

## 어긋난 점
- 계약의 C3 grep에 `draggable`이 들어 있었는데 `FileIcon.tsx`의 기존 `draggable={false}`가 걸린다. 이전부터 있던 무관한 코드라 남겼다.
- 합성 입력으로는 마우스가 완전히 멈춘 채 Control만 눌렀을 때 표시가 바로 안 바뀌었다(`System Events`의 modifier 키 이벤트가 DOM keydown으로 안 보임). 마우스가 조금이라도 움직이면 `mousemove`의 `ctrlKey`로 바뀐다. 실제 키보드의 Ctrl keydown이 어떻게 오는지는 확인하지 못했다.
- 이동/복사 판정은 놓는 순간의 `mouseup` `ctrlKey`(하드웨어 상태)를 쓴다.
