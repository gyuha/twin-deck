<!-- forge-slug: preview-shift-right -->
<!-- task: 80 -->
<!-- tdd: on -->
# Shift+→로 커서 항목(폴더·파일)을 미리보기한다

## Goal / Non-goals
- Goal: 목록에서 커서가 놓인 항목이 폴더든 파일이든 `Shift+→`(`Shift+Right`)로 미리보기를 연다. 기존 `core.preview`(`Mod+Y`)에 키를 하나 더 거는 것이라 새 액션 ID는 만들지 않는다. 폴더에서는 안으로 들어가지 않고 폴더 미리보기(하위 항목 트리)가 열린다. 파일에서 `→`로 미리보기하는 기존 동작과, 폴더에서 `→`로 들어가는 기존 동작은 그대로다. 여러 컬럼 보기에서도 `Shift+→`는 컬럼 이동이 아니라 미리보기를 연다. 미리보기가 열려 있는 동안 `Shift+→`는 아무것도 하지 않는다(닫기는 기존 `←`·`Space`·`Esc`·`Mod+Y`).
- Non-goals: `→`의 의미 변경, 미리보기 안의 키 변경, 새 설정 키·새 액션 ID, 이슈 #19 제목 수정·코멘트·닫기.

## Source of truth
- Glossary terms: none
- Related ADRs: `docs/adr/0007-action-registry.md`(액션과 바인딩), `0010-cross-platform-keymap.md`
- 이슈 추적: GitHub 이슈 #19
- 사전 확인(작성 시점): `Shift+Right`는 `packages/actions/src/defaults.ts`, `docs/05-actions-keybindings.md` 어디에도 배정돼 있지 않고(0건), `useKeyboard.ts`는 Shift+↑/↓만 가로챈다. `goRight()`는 여러 컬럼이면 컬럼 이동, 폴더면 `open()`, 아니면 `previewToggle()`이다.
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/preview-shift-right.test.tsx` 통과, `it(` 7개 이상(착수 전 파일 없음). 값으로 단언한다: (a) 폴더(`docs`)에서 `Shift+→` → "미리보기: docs" 창이 열리고 경로 표시줄은 그대로(`/home/a`), (b) 파일(`a.txt`)에서 `Shift+→` → "미리보기: a.txt" 창에 내용이 보인다, (c) 기존: 파일에서 `→` → 미리보기가 열린다, (d) 기존: 폴더에서 `→` → 그 폴더로 들어가고 미리보기 창은 없다, (e) 미리보기가 열린 뒤 `Shift+→` → 창이 그대로(같은 제목)이고 닫히지 않는다, (f) 여러 컬럼 보기에서 `Shift+→` → 미리보기가 열리고 커서 항목이 바뀌지 않는다, (g) 항목이 하나도 없는 폴더에서 `Shift+→` → 아무 창도 열리지 않는다. **구현 전에 (a)(b)(e)(f)가 실패(red)해야 한다**(c)(d)(g)는 회귀 방지라 사전 통과가 정상이다.
  2. 키 맵: `defaultBindingsFor`가 `linux`와 `mac` 모두에서 `core.preview`의 키로 `Mod+Y`와 `Shift+Right`를 돌려준다 — `packages/actions`의 기존 키 충돌·카탈로그 테스트(`bunx vitest run`)가 통과하고, `grep -c "Shift+Right" packages/actions/src/defaults.ts` ≥ 1 (착수 전 0).
  3. `grep -c "Shift+Right" docs/05-actions-keybindings.md` ≥ 1 (착수 전 0): `core.preview` 줄의 키 칸에 적는다.
  4. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run --exclude '**/pdf-preview*'`(86파일 765건) 통과.

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `preview-shift-right.test.tsx`에 (a)~(g)와 키 맵 단언을 쓰고 red를 기록한다 — completion criterion: DoD 1의 red 상태
- [ ] S2. `defaults.ts`의 `core.preview` 바인딩에 `Shift+Right`를 더한다. 테스트가 요구하면 `previewToggle`이 열려 있을 때 닫지 않는 경로만 최소로 손본다 — completion criterion: DoD 1 green, DoD 2 (depends: S1)
- [ ] S3. `docs/05-actions-keybindings.md`의 `core.preview` 줄(키 칸, 설명)을 갱신한다 — completion criterion: DoD 3 (depends: S2)
