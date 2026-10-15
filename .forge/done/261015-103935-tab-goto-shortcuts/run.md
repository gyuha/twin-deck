# run — 탭 번호로 이동하는 단축키 (이슈 #73)

워크플로 없이 이 세션에서 직접 실행했다(작은 변경).

## 슬라이스별 결과
- S1 액션·바인딩·핸들러 — ✅ 계획대로. `core.tab.goto`(인수 `index`)를 `defaults.ts`에 정의하고 mac은 `Mod+1~9`, other는 `Ctrl+Shift+1~9`로 pane·terminal 스코프에 바인딩했다. `actions.ts` 핸들러, `store.ts`의 `gotoTab`, ko/en i18n 이름을 추가했다.
- S2 `tab-goto.test.tsx` — ✅ 14개 통과(mac·windows·linux 각각 2번째/1번째, 9=마지막, 범위 밖 무시, 활성 패널만 이동, Ctrl+Alt+1이 표시 모드 유지, 터미널 탭에서 출발·도착). 터미널 케이스는 처음에 이미 활성인 탭으로 가서 검증이 약해 순서를 바꿔 고쳤다.
- S3 문서 — ✅ `docs/05` 행, README 한 쌍. 처음 쓴 C3의 README 검사(`Ctrl+Shift+`)는 기존 `Ctrl+Shift+Tab`이 이미 일치해 작업 전에도 통과하는 잘못된 검사라 `Ctrl+Shift+1`로 바로잡고 `loop.md`·`plan.md`에 적었다.

## DoD baseline → after
1. `vitest run src/__tests__/tab-goto.test.tsx`: 파일 없음 → 14 통과
2. `tsc --noEmit` 0 → 0(회귀 방어선). 전체 vitest: 1340(0.6.10 기준) → 1354 통과. 단, 같은 코드로 세 번 돌려 첫 번째 8개, 두 번째 1개(서로 다른 테스트)가 실패했고 세 번째는 전부 통과했다. 실패한 파일은 따로 돌리면 통과하고, 그 시점 load average가 36이었다. 시간 초과로 보이지만 확정은 아니다.
3. `grep -l core.tab.goto docs/05…`: 출력 없음 → 파일 출력. `grep -c "Ctrl+Shift+1" README.md README.en.md`: 0, 0 → 1, 1.

## 계획과의 차이
- Windows 키: 이슈의 `Ctrl+Alt+숫자`는 표시 모드(`Mod+Alt+0~3`)와 같은 조합이라 사용자가 `Ctrl+Shift+숫자`로 정했다(루프 시작 전 확인).
- 실제 앱(WKWebView)에서의 동작은 확인하지 못했다. 키 이벤트는 jsdom(user-event)로만 검증했다.
