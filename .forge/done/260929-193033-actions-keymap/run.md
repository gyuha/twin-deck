# RUN — actions-keymap
- S1 @twin-deck/keybinds (키 파서/플랫폼 매핑/스코프 해석) — ✅ vitest 12 passed (mac vs linux 매핑 포함)
- S2 @twin-deck/actions (레지스트리, isApplicable, dispatch) — ✅ ACT-02 케이스 포함, 중복 ID 오류
- S3 M1 기본 액션/키맵 — ⚠ docs/05에 없는 자체 ID 추가: `core.select.toggle`(Space/Insert — M2의 미리보기 Space와 충돌 예정, 그때 재배정), `core.quickselect.accept/cancel`, `core.dialog.confirm/cancel`
- 액션 컨텍스트는 화면 상태 요약(ActionContext)으로 정의: hasCursorItem/selectedCount/tabCount/canGoUp/cursorIsDir
DoD: keybinds 12 + actions 12 passed.
