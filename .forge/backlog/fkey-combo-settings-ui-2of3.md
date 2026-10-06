<!-- forge-slug: fkey-combo-settings-ui-2of3 -->
<!-- task: 71 -->
<!-- part: 2/3 -->
<!-- tdd: off -->
# F키 설정 화면에서 조합키 항목을 추가·삭제한다

## Goal / Non-goals
- Goal: 설정의 "F키" 탭에 "추가" 버튼을 둔다. 새 줄에서 F키(F1~F12)와 Ctrl/Alt/Shift/Mod 체크박스를 고르고 동작(기본값 없음 · 해제 · 액션 · 애플리케이션 실행)을 지정한다. 만든 줄은 삭제할 수 있다. 기본 F1~F12 줄은 그대로 둔다.
- Non-goals: Action Bar 노출 체크(3of3), `keybindings.toml` 편집 UI, 조합키 충돌 자동 해결.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #16
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/fkey-combo.test.tsx` 통과, 파일에 `it(` 3개 이상. 테스트가 실제 설정 저장소(FakeBackend)에서 `fkeys["Ctrl+F5"]`가 저장·복원되는 것을 확인한다(문구가 있는지가 아니라 값이 저장되는지).
  2. 같은 F키에 서로 다른 수식키 조합 줄 두 개를 만들 수 있고, 이미 있는 조합을 또 만들면 막는다(테스트).
  3. 줄 삭제 시 `fkeys.<키>`와 `fkey_apps.<키>`가 모두 사용자 설정에서 사라진다(테스트).
  4. 설정 탭 목록 테스트(`settings.test.tsx`)가 통과하고, 새 줄이 있는 상태로 앱을 다시 열면 줄이 복원된다(테스트).
  5. `cd apps/desktop && bunx tsc --noEmit` 통과.

## Work slices
- [ ] S1. 설정에 저장된 조합키 키를 읽어 F키 탭에 줄로 보여 준다 — completion criterion: DoD 4
- [ ] S2. "추가" 버튼과 F키 선택·수식키 체크박스(Ctrl/Alt/Shift/Mod) 편집 줄을 만든다 — completion criterion: DoD 1, 2 (depends: S1)
- [ ] S3. 줄 삭제 — completion criterion: DoD 3 (depends: S1)
