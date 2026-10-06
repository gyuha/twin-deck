<!-- forge-slug: update-check-ui -->
<!-- task: 75 -->
<!-- part: 2/3 -->
<!-- tdd: off -->
# "업데이트 확인" 액션과 설치 확인 대화상자

## Goal / Non-goals
- Goal: 액션 `core.app.check_update`("업데이트 확인")를 만들어 액션 패널(`Mod+Shift+P`)과 도움말에서 실행할 수 있게 한다(기본 키 없음). 실행하면 확인 중임을 알리고, 결과에 따라 (a) 새 버전이 있으면 버전·릴리스 노트를 보여 주는 확인 창(설치/취소), (b) 최신이면 "최신 버전입니다" 안내, (c) 오류면 오류 안내를 낸다. 설치를 고르면 내려받아 설치하고 앱을 다시 시작한다. 시작 시 자동 확인은 하지 않는다.
- Non-goals: 자동 확인, 진행률 막대(설치 중 안내 문구만), 다시 묻지 않기 옵션, 설정 키 추가.

## Source of truth
- Glossary terms: none
- Related ADRs: `docs/adr/0007-action-registry.md`
- 이슈 추적: GitHub 이슈 #10
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/update-check.test.tsx` 통과, `it(` 6개 이상. `FakeBackend` 시나리오로: (a) 새 버전 있음 → 버전 문자열이 확인 창에 보이고 설치를 누르면 `installUpdate`가 정확히 1번 호출, (b) 취소 → 호출 0번, (c) 최신 → 안내 문구, (d) 확인 오류 → 오류 안내, (e) 설치 오류 → 오류 안내, (f) 확인이 이미 진행 중일 때 다시 실행해도 `checkUpdate`가 한 번만 호출.
  2. `grep -c "core.app.check_update" packages/actions/src/defaults.ts apps/desktop/src/actions.ts docs/05-actions-keybindings.md` 세 파일 모두 ≥ 1.
  3. `fkey-bindings.test.tsx`의 F키 기본 바인딩 열거와 `packages/actions` 테스트 통과(새 액션은 기본 키가 없으므로 영향 없음 — 사전 통과가 정상인 회귀 방지 항목).
  4. `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run --exclude '**/pdf-preview*'` 통과.

## Work slices
- [ ] S1. 액션 등록(`defaults.ts`)과 핸들러(`actions.ts`) — completion criterion: DoD 2
- [ ] S2. 스토어 `api.checkForUpdate()`: 확인 → `ask()` 확인 창 → 설치 호출, 중복 실행 방지, 결과·오류 안내(`notice`) — completion criterion: DoD 1 (depends: S1)
- [ ] S3. 문서 `docs/05-actions-keybindings.md` 액션 표에 추가, 테스트 작성 — completion criterion: DoD 1, 2, 3, 4 (depends: S2)
