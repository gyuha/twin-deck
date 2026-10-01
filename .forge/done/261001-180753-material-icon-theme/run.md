# 실행 기록 — Material Icon Theme 파일 아이콘 적용

워크플로 없이 메인 세션에서 TDD로 직접 실행했다(슬라이스 6개, 규모가 작아 서브에이전트 비용이 이득보다 컸다).

## 슬라이스 결과
- S1 `packages/material-icons` 패키지(SVG 1,199개, 매니페스트, LICENSE, ORIGIN.md) — ✅ as planned
- S2 `iconNameFor`/`iconFileName` (테스트 13개, 먼저 red 확인 후 구현) — ✅ as planned
- S3 `FileIcon` + `iconUrls.ts`(`import.meta.glob ?url`) — ⚠ 계획에 없던 `vite.config.ts` 변경 추가(아래)
- S4 `FileTable` 행/헤더에 아이콘 칸 추가 — ⚠ 두 번 고침(아래)
- S5 `THIRD_PARTY_NOTICES.md`, `docs/m2-status.md` — ✅ as planned
- S6 실제 앱 시각 확인 — ✅ 사용자 확인 완료

## 계획과 달랐던 점
- **`assetsInlineLimit` 설정 추가.** Vite는 4KB 미만 에셋을 base64로 JS에 넣는다. SVG 대부분이 해당해 "SVG 본문은 번들에 넣지 않는다"는 합의가 깨질 뻔했다. `vite.config.ts`에 SVG만 인라인하지 않는 설정을 넣었다. 빌드 결과 JS 694KB(매니페스트 286KB 포함), `dist/assets`에 SVG 1,196개(내용 동일 3개는 병합).
- **기존 테스트 헬퍼가 행의 `span` 순서에 의존**(`querySelectorAll("span")[1]`이 이름 칸). 아이콘 칸을 `span`으로 만들면 기존 테스트가 깨지므로 `div`+`img`로 만들었다. 링크 화살표는 텍스트가 아닌 CSS `::after`라 `textContent`도 바뀌지 않는다.
- **`theme.test.tsx` 가드 위반을 한 번 냈다.** 링크 화살표에 `text-blue-700`을 썼더니 다크 팔레트에 없는 색이라 실패했다. 색 지정을 빼서 글자색을 상속하게 했고(커서 행 흰 글씨에서도 대비 유지), 통과했다.
- 테스트 하나는 내 단언이 틀렸다(`names()`는 행 전체 텍스트). 구현이 아닌 테스트를 고쳤다.
- 복사 대상 수: 계획 작성 중 정정한 값(52개 제외, 1,199개)이 그대로 맞았다.

## DoD baseline → after
1. 필수 파일 존재 — 디렉터리 없음 → 3개 모두 존재 (전진 확인)
2. `_light.svg` 수 / 전체 SVG 수 — 해당 없음 → `0` / `1199` (전진 확인)
3. 매니페스트 참조 아이콘 파일 존재 — 해당 없음 → `missing: []` (테스트로 영속화, 패키지 테스트 13개)
4. 타입체크 — 4개 통과 → 5개(새 패키지 포함) 모두 `Exited with code 0` (회귀 방지, 사전 통과)
5. desktop vitest — 247개 통과 → 252개 통과 (신규 5개, 회귀 방지, 사전 통과)
6. 렌더 검증 — 해당 없음 → `file-icons.test.tsx`가 `main.ts`→typescript, `package.json`→nodejs, `src/`→folder-src, `x.zzz`→file, 심볼릭 링크→rust+`data-link`, 멀티 컬럼, `icon_size=20`을 `img[src]`/속성으로 확인
7. `THIRD_PARTY_NOTICES.md` — `0` → `2` (`material-icon-theme` 줄 수), 버전 5.38.1·MIT 표 존재
8. 시각 UAT — 미실시 → 사용자가 실제 앱에서 정상 확인
