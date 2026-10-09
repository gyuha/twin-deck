# 2026-10-09 — 디스크 PDF를 파일 주소로 직접 열기 시험 (#124)

## Plan vs actual
- 계획대로 된 것: 스위치(`preview.pdf_direct`, 기본 꺼짐), Rust가 켜지면 파일을 읽지 않음, 프런트가 파일 주소를 `iframe`에 직접 줌. 실제 앱에서 큰 PDF가 잘 열렸다(사용자 확인).
- 어긋난 것: 없음.

## Learnings
- 다음에는 이렇게: 성능 개선은 한 쪽만 바꾸면 효과가 없다(Rust가 읽지 않아야 하고 프런트도 복사를 안 해야 한다). 한 번에 양쪽을 스위치 하나로 묶고, 실패를 자동 감지할 수 없는 구성(iframe)은 사람이 끌 수 있는 스위치를 먼저 둔다. 가정(WKWebView가 asset 주소의 PDF를 연다)은 계획의 "실제 앱 확인" 항목으로 못 박아 두면 되고, 이번에 확인됐다.
- 남은 일: 기본값을 켤지 결정(Windows WebView2 미확인), 켜는 순간 `pdf_max_mb`가 이 경로에서 무의미해짐을 문서에 이미 적었다.

## Doc updates
- CONTEXT.md promotion: none
- ADR added: none (되돌리기 쉬운 스위치라 ADR 기준 미충족)
