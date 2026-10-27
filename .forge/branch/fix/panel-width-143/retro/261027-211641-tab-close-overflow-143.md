<!-- auto-retro: fg-loop -->
# 2026-10-27 — 긴 탭 이름이 패널 쌍을 창 밖으로 밀어내는 문제 수정 (이슈 #143)

## Plan vs actual
- What went as planned: 격리 인스턴스로 이슈를 먼저 재현하고(닫기 버튼을 켠 칸형 탭, 창 1169px), 같은 조건의 캡처로 수정을 판정했다. 회귀 테스트 red → green, 전체 vitest·tsc 통과.
- Divergences: 계획의 1순위 원인(닫기 버튼 래퍼가 넘침을 잘라 내지 않음)이 틀렸다. 래퍼에 `overflow-hidden`을 넣어도 그대로 넘쳤다. 실제 원인은 `PaneSplit` 박스에 `min-w-0`가 없어서, 탭 이름 합만큼의 최소 너비가 창 밖으로 밀어낸 것이었다. 닫기 버튼은 탭 여백(`px-6`)을 키워 그 합을 문턱 위로 올렸을 뿐이다.

## Learnings
- Do differently next time: CSS 넘침 원인은 클래스를 읽고 추론하지 말고 먼저 잰다. WKWebView는 외부에서 JS를 돌릴 수 없으니, 임시 `position:fixed` 오버레이에 조상 체인의 `clientWidth/scrollWidth/scrollLeft`를 찍고 `screencapture -l`로 읽으면 한 번에 넘치는 층이 보인다(창 제목은 네이티브 제목과 동기화되지 않아 쓸 수 없었다).
- Do differently next time: `overflow-hidden`은 flex 항목의 자동 최소 크기만 0으로 만든다. 부모의 min-content 기여까지 줄이지는 않는다. 넘침을 막으려면 넘치는 조상 flex 항목에 `min-w-0`를 준다.
- Do differently next time: 격리 인스턴스 창이 다른 창에 가려지면 WKWebView가 그리지 않아 캡처가 하얗게 나온다. 창을 빈 화면으로 옮긴 뒤 찍는다.

## Doc updates
- 검토 전(자동 회고)

## Follow-up candidates
- 칸형 탭에서 닫기 버튼을 끄면 긴 탭 이름이 `…` 없이 잘린다. 수정 전에도 같다. ID는 run.md의 후속 후보와 같다: fu-d7c015b7e49f
