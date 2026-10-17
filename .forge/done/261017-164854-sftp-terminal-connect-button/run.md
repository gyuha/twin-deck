# RUN — 설정의 SFTP·FTP 탭에 "터미널 연결" 버튼을 더한다 (이슈 #94 ①)

워크플로 없이 직접 실행했다(변경이 작아 단일 에이전트가 더 싸다).

## 슬라이스 결과
- S1 `store.ts`에 `connectRemoteTerminal(pane, index)` — ✅ as planned (연결 뒤 패널이 그 서버에 놓였을 때만 `terminalFocus()`)
- S2 `Settings.tsx` "터미널 연결" 버튼 + i18n ko/en — ✅ as planned (SFTP만 활성)
- S3 `docs/07-ui-spec.md` "SFTP 터미널 연결" 소절 — ✅ as planned

## DoD baseline → after
1. `remote-terminal-connect.test.tsx` — 파일 없음(실패) → 3개 통과
2. `tsc --noEmit` — 통과 → 통과 (회귀 가드, 이미 통과 상태)
3. `bun run test` — 1453 통과 → 1456 통과 (회귀 가드)
4. Rust·생성 바인딩 diff — 0 → 0 (회귀 가드)
5. `grep -c "터미널 연결" docs/07-ui-spec.md` — 0 → 2

## 기록
- 계획과 다른 점 없음. 시험은 처음부터 통과해서 "구현 전 빨강"은 확인하지 못했다(tdd: off).
- 한계: `FakeBackend`로만 검증했다. 실제 SSH 서버와 WKWebView에서의 동작은 보지 못했다.
