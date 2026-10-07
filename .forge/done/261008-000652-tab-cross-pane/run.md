# RUN — 탭을 끌어 다른 패널로 옮기고, 탭이 하나뿐이면 복사한다 (이슈 #24)

- S1 red 테스트 — ✅ `tab-transfer-store.test.ts` 6건(이동·활성 보정·복사·가상 탭·범위/같은 패널·보정)과 `tab-drag-cross-pane.test.tsx` 5건. 구현 전 스토어 6건은 `transferTab` 부재로, 컴포넌트는 이동 단언 실패(기존에는 x좌표로 같은 패널 안 맨 끝으로 재배치)
- S2 스토어 — ✅ `transferTab(from, index, to, toIndex)`: 탭 2개 이상이면 이동(탭 객체 그대로), 하나뿐이면 `newTab(path)`로 복사 후 `reload`. 활성 보정, 가상 탭·범위 밖·같은 패널은 무변화. `tabDropTarget` 상태와 `setTabDropTarget`
- S3 TabBar — ✅ 누른 시점의 반대쪽 탭 줄 사각형을 좌표로 판정(끌린 탭이 커서 밑에 있어 이벤트 target을 쓰지 않음), 놓을 자리는 탭 중심 기준 삽입 위치, `data-pane`·`data-drop-target`, 놓기·Esc·blur 처리. 탭이 하나여도 끌 수 있게 했다. `docs/07-ui-spec.md` 갱신

## DoD baseline → after
1. 스토어 6건·컴포넌트 5건: red → 통과
2. 기존 `tab-drag-reorder`·`tab-drag-edges`·`pane-tab-appearance`·`tab-switch` 통과(총 28건 포함)
3. `grep -c "패널 간 탭" docs/07-ui-spec.md` 0 → 1
4. vitest 845 → 856 통과(model-formats 기준선 1파일), tsc 0, cargo test(desktop 49·td-config 29), Rust·설정 변경 없음

## 차이·메모
- 동작 변경: 자기 탭 줄에서 세로로 24px 넘게 벗어나 놓으면 순서를 바꾸지 않는다(이전에는 x좌표만으로 맨 앞/뒤로 재배치). 전에 리뷰에서 지적된 "탭 줄 밖에서 놓아도 순서가 바뀜"을 같이 고친 것이다. 기존 테스트는 y=10이라 영향이 없었다.
- 실제 앱(WKWebView)에서는 끌기를 눈으로 확인하지 못했다. 스텁한 레이아웃(두 탭 줄) 기준이다. 끌린 탭 자체는 가로로만 따라오고 반대쪽 패널로 넘어가는 동안 세로로는 따라오지 않는다.
- 이동한 탭의 반대쪽 패널 폴더 감시(`syncWatches`)는 호출하지만 이동 후 감시가 정리되는지는 별도 테스트로 고정하지 않았다.
