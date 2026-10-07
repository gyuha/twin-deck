<!-- forge-slug: remove-parent-folder-row -->
<!-- task: 84 -->
<!-- tdd: on -->
# 경로 표시줄 아래의 `..`(상위 폴더 버튼) 줄을 없앤다

## Goal / Non-goals
- Goal: 파일 목록 위의 `..` 줄(상위 폴더 버튼, `FileTable.tsx`)을 지운다. 무엇인지 알 수 없다는 질문(이슈 #22)과, 마우스로 누르면 그 줄에 파란 포커스 테두리가 남는 문제를 뿌리에서 없앤다. 숨김 옵션은 만들지 않는다(사용자 결정: 지워도 된다). 상위 폴더로 가는 길은 그대로 남는다: `Backspace`, `←`(여러 컬럼 보기가 아닐 때), macOS의 `Alt+↑`(액션 `core.go.up`), 경로 표시줄의 상위 폴더 조각 클릭(NAV-12).
- 잃는 것: "`..` 더블클릭으로 상위 이동" 하나. 마우스만 쓸 때는 경로 표시줄 조각 클릭으로 대신한다.
- Non-goals: `..`를 목록의 일반 행으로 옮기는 것(Marta의 `[..]`), 숨김·표시 설정, `core.go.up`·`←`·`Backspace` 키 변경, 경로 표시줄 변경, 이슈 #22를 닫거나 코멘트하는 일.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #22
- 명세 변경: `docs/07-ui-spec.md` 69행은 "`..` 항목: 목록 맨 위에 상위 폴더 항목을 표시하고 더블클릭/Return으로 상위 이동 (Marta 확인)"이라 적고 있다. 이번에 이 명세를 **의도적으로 바꾼다.** 위 키·조각 클릭은 이미 있고 그대로 남는다.
- 사전 확인(작성 시점): `aria-label="상위 폴더"` 버튼은 `FileTable.tsx`에 1곳(양쪽 패널이 같은 컴포넌트를 쓴다). 기존 테스트 `navigation.test.tsx`의 "'..' 항목 더블클릭으로 상위 이동"이 이 버튼을 쓴다. 기준선: `tsc` 0, vitest(pdf-preview 제외) 91파일 통과 + 1파일(`model-formats.test.ts`, jsdom에 canvas가 없어 로드 실패 — 다른 작업의 기준선 잡음) 793건 통과.
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/parent-folder-row.test.tsx` 통과, `it(` 5개 이상(착수 전 파일 없음). 값으로 단언한다: (a) 두 패널 어디에도 이름이 `상위 폴더`인 버튼이 없다 (구현 전엔 2개라 실패 = red), (b) 목록 위에 글자가 정확히 `..`인 요소가 없다 (red), (c) `Backspace`로 상위 폴더로 이동하고 경로 표시줄이 `/home`이 된다 (사전 통과, 회귀 방지), (d) `←`로도 같다 (회귀 방지), (e) 경로 표시줄의 `home` 조각을 클릭하면 이동한다 (회귀 방지), (f) 루트(`/`)에서는 `Backspace`가 아무 일도 하지 않고 오류 알림도 없다 (회귀 방지). (a)(b)는 구현 전에 실패해야 한다.
  2. `navigation.test.tsx`: "`..` 항목 더블클릭으로 상위 이동"을 지우고 같은 파일에 "경로 표시줄 조각 클릭과 Backspace로 상위 이동"이 이미 있는지 확인한다(없으면 그 두 경우를 넣는다). `bunx vitest run src/__tests__/navigation.test.tsx` 통과.
  3. `grep -c 'aria-label="상위 폴더"' apps/desktop/src/ui/FileTable.tsx` → 0 (착수 전 1).
  4. 문서: `grep -c '`..` 더블클릭' docs/01-feature-spec.md` → 0 (착수 전 1), `grep -c '`..` 항목' docs/07-ui-spec.md` → 0 (착수 전 2), `docs/m1-status.md`의 NAV-03 줄에서 `..` 더블클릭 설명이 "이후 제거됨"으로 바뀐다(`grep -c '`..`' docs/m1-status.md` 착수 전 1). 69행은 "`..` 줄은 두지 않는다. 상위 이동은 `Backspace`·`←`·경로 표시줄 조각 클릭"으로 바꾸고, 143행의 빈 폴더 설명은 "항목 없음" 문구만으로 고친다.
  5. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts` 1파일은 기준선 잡음).

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `parent-folder-row.test.tsx` (a)~(f)를 쓰고 red를 기록한다 — completion criterion: DoD 1의 red 상태((a)(b) 실패, (c)~(f) 통과)
- [ ] S2. `FileTable.tsx`에서 `..` 상위 폴더 버튼 블록을 지운다 — completion criterion: DoD 1 green, DoD 3 (depends: S1)
- [ ] S3. `navigation.test.tsx`의 옛 더블클릭 테스트를 정리한다 — completion criterion: DoD 2 (depends: S2)
- [ ] S4. 문서(`01-feature-spec`, `07-ui-spec`, `m1-status`)를 맞춘다 — completion criterion: DoD 4 (depends: S2)
