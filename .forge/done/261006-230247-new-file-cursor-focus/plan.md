<!-- forge-slug: new-file-cursor-focus -->
<!-- task: 77 -->
<!-- tdd: on -->
# Shift+F7로 새 파일을 만들면 커서를 새 파일로 옮긴다

## Goal / Non-goals
- Goal: `newFile`(Shift+F7)로 파일을 만든 뒤 활성 패널의 커서가 만든 파일 행으로 이동하고, 목록이 길어 화면 밖이어도 보이게 스크롤된다. `newFolder`와 같은 방식이다(중첩 경로 `a/b.txt`는 맨 위 폴더 `a`로, 이름 비교는 NFC로).
- Non-goals: 이름 바꾸기의 커서 이동, 선택 상태 변경, 설정 항목 추가, `newFolder` 동작 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #18
- 앞선 작업: `.forge/done/261005-131636-new-folder-focus` (새 폴더 커서 이동, 이슈 #3) — 같은 패턴을 쓴다.
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/file-ops.test.tsx -t "새로 만든 파일"` → 통과 3개 이상, 실패 0. 테스트: (a) 정렬상 맨 아래 이름 `zzz.txt`를 항목 30개짜리 목록에서 만들면 `cursorName("left")`가 `zzz.txt`, (b) 중첩 경로 `zsub/deep.txt`를 만들면 커서가 `zsub`, (c) 이미 있는 이름(`docs`)이면 오류 알림이 뜨고 커서는 그대로. **red → green:** 구현 전에 (a)(b)가 실패해야 한다(전체 실행에서 `-t` 필터가 비면 통과로 보이니 "passed ≥ 3"까지 확인).
  2. `sed -n '/async newFile()/,/^    },/p' apps/desktop/src/state/store.ts | grep -c "cursorToCreated\|setCursor"` ≥ 1 (착수 전 0).
  3. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'` 통과(기존 `F7: 새로 만든 폴더…` 테스트 포함).

## Work slices
- [ ] S1. 먼저 실패하는 테스트 3개를 `file-ops.test.tsx`에 추가한다 — completion criterion: DoD 1 red 상태 기록
- [ ] S2. `newFile`이 `reloadAll()` 뒤에 새 항목을 찾아 `setCursor`로 옮긴다(`newFolder`의 찾기 로직을 공통으로 쓰거나 같은 방식으로 작성) — completion criterion: DoD 1 green, DoD 2, DoD 3 (depends: S1)
