# RUN — 드래그 & 드롭으로 복사·이동 (drag-drop-transfer)

워크플로 없이 직접 실행했다(작은 작업).

- S1 store: `dragBegin`/`dragEnd`/`isDragging`/`dragSourcePane`/`dropTransfer` — ✅ 계획대로 (`runTransfer`·`transferDestError` 재사용)
- S2 `FileTable` 행 `draggable`, 폴더 행의 `dragover/dragleave/drop`(강조·`dropEffect`·Ctrl이면 이동), `Pane` 빈 곳 드롭, `drag-drop.test.tsx` 12개 — ✅ 계획대로
- S3 실제 앱 확인 — ✅ 드래그 복사와 Ctrl 드래그 이동 모두 확인(사용자 보고 뒤 Ctrl 상태를 운영체제에서 읽도록 고친 다음)

## DoD baseline → after
- drag-drop.test.tsx: 0개 → 12개 통과
- vitest 전체 527 통과·실패 1(기존 `pdf-preview`), `tsc` 오류 없음, `cargo test --workspace`·fmt·clippy 통과
- 실제 앱(격리 인스턴스, macOS): 마우스 드래그로 `one.txt`를 반대 패널에 놓으면 `dst/one.txt`가 생기고 원본 유지(복사 ✔)
- 실제 앱: Ctrl 상태를 운영체제에서 읽도록 고친 뒤 Ctrl을 누른 채 `two.txt`를 놓으면 `dst/two.txt`가 생기고 원본이 사라짐(이동 ✔)

## 어긋난 점
- Tauri 기본값 `dragDropEnabled: true`가 앱 안의 HTML5 드래그를 가로채 드롭이 아무 일도 하지 않았다. `tauri.conf.json`의 창 설정에 `"dragDropEnabled": false`를 넣자 드래그 복사가 동작했다(Finder 등 외부 파일을 끌어 오는 기능은 이 앱에 원래 없었다).
- Ctrl 이동: 합성 입력(CGEvent 마우스, 키보드/flagsChanged 이벤트, System Events `key down control`)으로 Ctrl을 누른 채 놓아도 웹뷰의 드롭 이벤트가 `ctrlKey=false`로 보였다. 합성 키가 드래그 세션의 수정자 상태에 반영되지 않는 것인지, WKWebView가 드래그 중 Ctrl을 주지 않는 것인지 이 환경에서는 구분하지 못했다. 사람이 실제 Ctrl 키로 확인해야 한다.
- 테스트 중 사용자의 다른 창에 합성 마우스 이벤트가 두 번 갔다(같은 이름의 프로세스가 둘이라 창 위치를 잘못 읽음): Claude 창 위의 클릭 한 번과 드래그 한 번. 파일에는 영향이 없다.
- 합성 마우스로 Ctrl+클릭을 하면 우클릭 메뉴가 열려 이후 드래그를 막았다(Esc로 닫음).

## 사용자 보고와 수정 (벽 해소)
- 사용자가 실제 Ctrl 키로 확인한 결과: Ctrl을 눌러도 커서의 + 표시가 그대로이고 놓으면 복사된다. macOS 웹뷰가 드래그 중 Ctrl 상태를 DOM `ctrlKey`로 주지 않는다는 것이 확인됐다(합성 입력 실험과 같은 결과).
- 수정: `is_ctrl_down` Tauri 명령(macOS `NSEvent.modifierFlags`)을 추가하고(`objc2-app-kit`에 `NSEvent` 기능), 드래그 중 50ms마다 읽어 `dropEffect`에 쓰고, 놓는 순간 한 번 더 읽어 이동 여부를 정한다. 계약의 범위(프런트엔드 중심)를 `apps/desktop/src-tauri`의 명령과 `packages/ts-client`로 넓혔다 — 사용자가 Ctrl 이동이 안 된다고 보고한 것이 그 승인이다.
- 합성 입력(System Events `key down control`)도 이 값에는 반영돼 실제 앱에서 이동을 증명할 수 있었다.
- 커서의 + 표시가 사라지는지는 눈으로 확인하지 못했다(커서는 화면 캡처에 안 잡힌다). `dropEffect`를 move로 주지만 macOS가 Ctrl을 '링크' 동작으로 매핑하면 + 표시가 남을 수 있다 — 동작(이동)과는 별개인 표시 문제다.
