<!-- forge-slug: fkey-action-bar-exposure-3of3 -->
<!-- task: 72 -->
<!-- part: 3/3 -->
<!-- tdd: off -->
# F키 설정의 "Action Bar에 표시" 체크로 지정한 항목을 Action Bar에 노출한다

## Goal / Non-goals
- Goal: F키 설정의 각 줄(기본 F1~F12와 조합키 줄)에 "Action Bar에 표시" 체크박스를 둔다. 체크한 줄은 Action Bar의 기존 구성(`layout.action_bar`) 뒤에 F키 순서(F1→F12, 조합키 줄은 그 뒤)로 이어 붙는다. 버튼은 그 줄의 키 표기와 동작 이름을 보여 주고, 누르면 그 줄의 동작을 같은 인수(앱 경로 등)로 실행한다. 이슈 #16의 "즐겨찾기가 잘 안 보인다"는 불만은 F키에 `core.menu.favorites`를 걸고 이 체크를 켜서 해결한다.
- Non-goals: 기본 `layout.action_bar` 구성 변경, Action Bar 안에서 순서 끌기, 즐겨찾기 메뉴 동작 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #16
- Definition of Done:
  1. td-config에 `fkey_bar`(키 → bool, 기본은 비어 있음/모두 꺼짐)가 있고 `cargo test -p td-config fkey_bar` 통과 — 기본값 꺼짐, 사용자 설정 라운드트립, 잘못된 키 경고.
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과.
  3. `cd apps/desktop && bunx vitest run src/__tests__/fkey-action-bar.test.tsx` 통과, 파일에 `it(` 3개 이상: (a) 체크한 줄만 바에 나타난다, (b) 버튼을 누르면 그 줄의 액션이 실제로 실행된다(앱 실행이면 해당 경로 인수 포함), (c) 체크가 꺼져 있으면 바가 기존과 똑같다.
  4. 기존 `action-bar.test.tsx`가 수정 없이 통과한다 (사전 통과가 정상인 회귀 방지 항목).
  5. 설정 화면의 체크박스를 켜면 사용자 설정 파일(`config.toml`)에 값이 저장된다 — FakeBackend 설정 조회로 확인하는 테스트.
  6. `cd apps/desktop && bunx tsc --noEmit` 통과.
  7. `grep -c "fkey_bar" docs/05-actions-keybindings.md` ≥ 1 (문서 갱신).

## Work slices
- [ ] S1. td-config `fkey_bar` 추가 + default.toml + `task gen-types` — completion criterion: DoD 1, 2
- [ ] S2. F키 설정 각 줄에 "Action Bar에 표시" 체크박스 — completion criterion: DoD 5 (depends: S1)
- [ ] S3. `ui/ActionBar.tsx`가 체크된 줄을 뒤에 이어 붙여 렌더하고 클릭 시 인수와 함께 실행한다 — completion criterion: DoD 3, 4 (depends: S1)
- [ ] S4. 문서 갱신 — completion criterion: DoD 7
