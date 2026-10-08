# 실행 기록 — 설정의 테마 목록에서 임시 미리보기 (이슈 #30)

워크플로우 없이 한 세션에서 직접 처리했다(규모가 작다).

## 조각별 결과
- S1 `Combobox`에 `onPreview` 추가 — ✅ 계획대로. 열었을 때 현재 값 위치는 미리보기로 치지 않고(`touched` 플래그), ↑↓·마우스 오버·검색 입력으로 커서가 움직일 때만 호출한다. Esc·바깥 클릭·트리거 재클릭으로 닫으면 `null`.
- S2 미리보기 상태 연결 — ✅ 계획대로. `App.tsx`가 `themePreview` 상태를 두고 `useTheme(themePreview ?? 설정값)`을 쓴다. 설정값이 바뀌면 상태를 비우고, 설정 화면이 닫히면 `Settings`가 비운다. 확정(Enter·클릭) 때는 미리보기를 바로 비우지 않는다(저장 결과가 올 때까지 색이 깜빡이지 않게).
- 새 테스트 `theme-preview.test.tsx` 4건: 열기만 해서는 불변 · ↓ 이동 시 적용+저장 0회 · Esc 복귀 · 바깥 클릭 복귀 · Enter 확정 시 저장 1회와 유지. 수정을 되돌리면 4건 모두 실패하고(red) 적용하면 모두 통과한다(green).

## DoD / 정지 조건 (baseline → after)
- C1 theme-preview 테스트: 파일 없음 → 4건 통과
- C2 tsc: 통과 → 통과
- C3 vitest 전체의 실패 = 기준선: **불일치.** 실패 4건 = 기준선 3건(audio-preview · preview-scroll PDF · theme spaceui 토큰) + `theme-colors.test.ts`의 "spaceui 토큰이 정의하는 --color-* 이름" 1건. 이 1건은 내 수정을 되돌려도 똑같이 실패한다(`ENOENT … node_modules/@spacedrive/tokens/src/css/theme.css`, 이 저장소에 `node_modules/@spacedrive/tokens`가 설치돼 있지 않다). 기준선 3건 가운데 `theme`도 같은 종류의 `ENOENT`(`@spacedrive/primitives/dist`)다. 이번 작업 시작 때(전체 93파일)는 이 테스트가 통과했고 지금은 116파일이라 그사이 테스트가 늘었다.
- C4 Rust·바인딩 diff: 비어 있음 → 비어 있음
- 실제 앱 확인: 미실시(사람)
