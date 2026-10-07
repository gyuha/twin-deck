# RUN — 탭을 마우스 가운데 버튼으로 클릭하면 닫는다 (이슈 #27)

- S1 red 테스트 — ✅ `tab-close-at.test.ts` 7건(구현 전 `closeTabAt` 부재로 전부 실패)과 `tab-middle-close.test.tsx` 6건(구현 전 닫기·기본 동작 방지 단언 실패, 왼쪽·오른쪽 클릭 무변화·한 탭뿐 단언은 사전 통과 가드)
- S2 스토어 — ✅ `closeTabAt(pane, index)`(마지막 탭·범위 밖 무변화, 활성 보정, 가상 탭 스캔 취소, 활성 패널 불변). 기존 `closeTab()`은 이를 부른다
- S3 TabBar·문서 — ✅ 가운데 버튼 `mousedown`은 끌기를 시작하지 않고 `preventDefault`·`stopPropagation`(자동 스크롤 방지, 패널 활성화 방지), 닫기는 `onAuxClick`(button 1, 뗄 때). `docs/07` 가운데 클릭 설명 추가와 낡은 "P2 이후로 미룬다" 줄 삭제

## DoD baseline → after
1. 스토어 7건·컴포넌트 6건: red → 통과
2. 기존 `tab-switch`·`tab-drag-*`·`pane-tab-appearance` 통과 유지
3. `grep -c "가운데 버튼" docs/07` 0 → 1, `"P2 이후로 미룬다"` 1 → 0
4. vitest 884 → 899 통과(model-formats 기준선 1파일), tsc 0, `git diff -- crates apps/desktop/src-tauri` 비어 있음

## 차이·메모
- 첫 구현에서 다른 패널의 탭을 가운데 클릭하면 `Pane`의 `onMouseDown`이 그 패널을 활성화해 "활성 패널은 그대로" 단언이 실패했다. 가운데 버튼 `mousedown`에서 `stopPropagation`으로 해결했다.
- 닫기를 `mousedown`이 아니라 `auxclick`(뗄 때)에서 한다. 누른 채 다른 탭 위에서 떼면 `auxclick`이 오지 않아(다른 요소) 아무 탭도 닫히지 않는다.
- `mousedown` 기본 동작 방지는 Windows(WebView2)의 가운데 클릭 자동 스크롤을 막으려는 것이다. 이 환경에서는 Windows를 확인하지 못했다.
- 마지막 탭은 가운데 클릭해도 닫지 않는다(기존 `core.tab.close` 규칙을 따랐다. 사용자가 바꾸고 싶으면 별도로).

## 확인하지 못한 것
- 실제 앱(WKWebView·WebView2)에서 가운데 버튼을 눌러 보지 못했다. jsdom에서 `mousedown → mouseup → auxclick`을 흉내 낸 테스트다. 특히 macOS에서 `auxclick`이 가운데 버튼에 실제로 오는지, 트랙패드·마우스 소프트웨어(가운데 클릭을 다른 제스처로 매핑)에서 어떻게 보이는지는 직접 확인이 필요하다.
