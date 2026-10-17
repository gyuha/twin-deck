# RUN — 연결 메뉴에서 Shift+Enter로 SFTP 서버를 터미널로 연다 (이슈 #94 ②)

워크플로 없이 직접 실행했다(변경이 작다).

## 슬라이스 결과
- S1 액션 `core.menu.select_terminal` + `Shift+Return` 바인딩(panel) + 핸들러 — ✅ as planned (`Return`과 서로 가로채지 않는다는 것을 시험 (a)(b)로 확인)
- S2 `menuSelectTerminal()` — ✅ as planned (SFTP 항목만 동작, 그 밖의 항목은 아무것도 하지 않고 메뉴를 그대로 둔다 — 시험 (c)에 고정)
- S3 SFTP 항목 `terminal` 플래그 + `PopupMenu` 배지 + i18n — ⚠ 계획 밖 보정 2건: 액션 제목 i18n 키(`action.core.menu.select_terminal`, 두 언어)가 필요했고, 배지가 항목 텍스트에 붙어 기존 `drive-bar.test.tsx`의 항목 목록 기대값에 배지 문구를 넣었다(의도한 UI 변경이며 단언을 느슨하게 한 것이 아니다)
- S4 `docs/05-actions-keybindings.md` 행 — ✅ as planned

## DoD baseline → after
1. `remote-terminal-menu.test.tsx` — 파일 없음(실패) → 4개 통과
2. `tsc --noEmit` — 통과 → 통과 (회귀 가드)
3. `bun run test` — 1456 통과 → 1460 통과 (회귀 가드; 중간에 i18n·drive-bar 시험 2건이 깨졌다가 위 보정으로 복구)
4. Rust·생성 바인딩 diff — 0 → 0 (회귀 가드)
5. `select_terminal` docs/05 0 → 1, defaults.ts 0 → 2

## 기록
- 한계: `FakeBackend`로만 검증했다. 실제 SSH 서버와 WKWebView에서의 동작은 보지 못했다.
- 배지는 SFTP 항목에 한해 항상 보인다. 마우스 클릭의 터미널 변형은 만들지 않았다(Non-goal).
