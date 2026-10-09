<!-- forge-slug: dialog-button-focus -->
# 실행 기록 — 다이얼로그 버튼 포커스 (이슈 #41)

## 한 일
- `ui/Dialog.tsx`: 열린 뒤 기본 버튼(`data-dialog-primary`)에 포커스. 입력칸이 있는 다이얼로그는 입력칸 유지. 버튼에 포커스 링.
- `ui/Help.tsx`: 열리면 닫기 버튼에 포커스.
- `ui/useKeyboard.ts`: 다이얼로그 버튼에서 ←/→는 버튼 포커스 이동(끝에서 멈춤), Return은 포커스된 버튼의 클릭. 선택·충돌 창의 ←/→ 라디오 이동은 ↑/↓만 남김(이슈 요청에 따른 의도된 변경).
- `__tests__/dialog-focus.test.tsx`: 13개(종류 7가지 전수, ←/→·Return·Esc, 도움말, 파일 찾기).
- `docs/05-actions-keybindings.md`에 다이얼로그 포커스·키 설명 추가.

## 계획과 실제
- 계획과 거의 같다. 차이 없음.

## 검증
- C1~C4: `dialog-focus.test.tsx` 13 통과. C5: tsc 통과, vitest 1095 통과·실패는 기준선 2개 파일(`model-formats`, `pdf-preview`)뿐.
- 실제 앱(WKWebView)에서 눈으로 확인하지는 않았다.
