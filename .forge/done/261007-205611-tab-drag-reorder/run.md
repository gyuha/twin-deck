# RUN — 탭을 포인터로 끌어 같은 패널 안에서 순서를 바꾼다

- S1 red 테스트 — ✅ `tab-move-store.test.ts` 5건 + `tab-drag-reorder.test.tsx` 5건. 구현 전 8건 실패(moveTab 없음 5, 끌기 무반응 3), 임계 미만·제자리 2건은 사전 통과(회귀 방지)
- S2 `moveTab(pane, from, to)` — ✅ 활성 탭을 객체로 추적해 새 위치를 따라가고, 범위 밖·제자리는 상태 참조를 그대로 둔다
- S3 `TabBar.tsx` 끌기 — ✅ 마우스 이벤트(파일 끌기와 같은 방식), 임계 4px, 놓일 탭에 outline 표시, 끌기 직후 click 무시

## DoD baseline → after
1. 스토어 moveTab 5건: 없음 → 5 통과 (red 확인됨)
2. 컴포넌트 끌기 5건: 3 실패 → 5 통과
3. 저장: 상태 저장은 `panes` 변경을 구독해 자동으로 일어나므로 별도 코드 없음(순서는 상태에서 바로 반영) — 스냅샷 단언은 따로 넣지 않았다
4. vitest 803 → 813 통과(model-formats 로드 실패 1파일은 기준선), tsc 0, DragLayer.tsx diff 없음

## 차이·메모
- 계획 DoD 3(저장될 스냅샷의 탭 순서)은 전용 테스트 없이 상태 변화로 갈음했다.
- 실제 앱(WKWebView)에서 끌기를 눈으로 확인하지 못했다. jsdom 마우스 이벤트 기준이다.
