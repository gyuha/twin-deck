# run — HWP·HWPX 쪽 미리보기

워크플로 없이 이 세션에서 직접 실행했다(변경이 작아 서브에이전트 비용이 이득보다 컸다).

## 슬라이스별 결과
- S1 `@rhwp/core` 의존성 + `lib/hwp` 지연 로더 — ✅ 계획대로. Vite가 wasm(11.8MB)을 별도 자산으로 내보낸다(`vite build` 확인). 문서화되지 않은 `?url` 모듈 선언(`wasm.d.ts`)이 필요했다.
- S2 `ui/HwpView.tsx` — ✅ 계획대로
- S3 `Preview.tsx` 연결 — ✅ 계획대로. 압축 안 경로는 `!isArchivePath`로 제외했으나 이를 직접 검사하는 테스트는 쓰지 않았다(epub과 같은 가드).
- S4 문서 5곳 — ✅ README 한 쌍 포함
- S5 실제 앱 확인 — ⚠ 일부만. 실제 `@rhwp/core` wasm이 실제 `.hwp`(noori.hwp, 3쪽)를 Node에서 열고 SVG 380KB를 그렸다. WKWebView(Tauri 창)에서의 동작은 확인하지 못했다.

## DoD baseline → after
1. hwp-preview.test.tsx: 파일 없음(실패) → 5개 통과. 단, 테스트에서 (d) 압축 안 경로 항목은 빠졌다.
2. `grep -c '"@rhwp/core"' apps/desktop/package.json`: 0 → 1
3. `tsc --noEmit`: 0 → 0 (회귀 방어선, 처음부터 통과)
4. `vitest run` 전체: 161 파일 / 1340 테스트 통과 (회귀 방어선)
5. 문서 5곳 `grep -l -i hwp … | wc -l`: 0 → 5
6. 실제 앱 눈 확인: 미완. 사용자가 확인해야 한다.

## 계획과의 차이
- 계획 DoD 1 (d)(압축 안 제외)는 테스트하지 않았다.
- 워크플로 대신 직접 실행.
- 미해결 위험: WKWebView에서 wasm 초기화, Canvas 글자 폭 측정 콜백, 첫 로드 지연(wasm 12MB). 단위 테스트는 읽기 계층을 가짜로 바꾸므로 이를 증명하지 못한다.
