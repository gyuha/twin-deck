# RUN — ui-panes-navigation
- S1 스토어(zustand): 패널/탭/커서/선택/이력 — ✅ `state/store.ts` (PANE-01/02/04)
- S2 FileTable + 키보드 이동/열기/상위/브레드크럼 — ✅ (NAV-01/03/12). ⚠ `..`는 커서 대상이 아닌 별도 버튼(더블클릭). docs/07은 `..`를 목록 맨 위 항목으로 정의 — 커서 모델을 단순하게 두려고 분리
- S3 선택 + Quick Select — ✅ (SEL-01/02/05). Quick Select는 docs/07 기본값인 부분 일치. ⚠ IME 조합 중(`isComposing`) 입력은 무시하므로 실제 한글 IME 타이핑 Quick Select는 미검증 — 테스트는 완성된 글자 키 이벤트만 사용
- S4 숨김 토글 — ✅ (OP-17): Linux/Windows Ctrl+H, macOS Cmd+Shift+.
- S5 App 조립 — ✅ 키 이벤트 → Keymap → ActionRegistry, main.tsx는 TauriBackend + homeDir
부수: createDefaultRegistry가 일부 핸들러만 받도록 완화(+missingHandlers) — 파일 작업 핸들러는 다음 태스크(ui-file-ops-scenario)에서 연결.
탭 닫기: 마지막 탭은 액션 비활성(docs/07은 홈으로 이동으로 정의, 미확인 항목).
DoD: apps/desktop vitest 17 passed.
