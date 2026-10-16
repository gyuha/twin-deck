<!-- forge-slug: quick-choseong-search -->
<!-- task: 187 -->
<!-- generated-by: fg-loop -->
<!-- priority: medium -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 빠른 검색에서 한글 초성으로 검색한다 (이슈 #87 일부)

## 목표 / 비목표
- 목표: 빠른 선택에 `ㅎㄱ`을 입력하면 `한글 문서.txt`처럼 초성이 맞는 이름에 일치한다. `한ㄱ`(음절 + 초성)도 일치한다. 일치 하이라이트도 같은 규칙을 쓴다.
- 비목표: 자모 조립(1/2, `quick-hangul-assemble`), Windows 한영 전환, 입력 도중 미완성 음절의 증분 일치(`하`가 `한`에 일치), 설정 키(초성 검색은 항상 켠다), 이슈 닫기.

## 근거(코드로 확인한 사실)
- `lib/names.ts`의 `quickMatch`는 `normalizeName`(NFC + 소문자)한 `includes`/`startsWith`뿐이고, `quickMatchRange`는 같은 규칙으로 하이라이트 범위를 돌려준다(`lower.length !== shown.length`이면 null).
- `store.ts`의 `quickCursor`·`quickMove`·`FileTable.tsx`의 `QuickHighlight`가 모두 이 두 함수를 쓴다. 따라서 이 두 함수만 바꾸면 커서 이동과 하이라이트가 함께 따라온다.
- `es-hangul`의 `getChoseong`(음절 → 초성)을 쓸 수 있다(이미 의존성).

## 원천(Source of truth)
- 용어: 없음
- 관련 ADR: 없음
- 관련 이슈: #87 (일부 — 초성 검색만. 이슈를 닫지 않는다)
- 완료 정의(DoD): `.forge/loop.md`의 C2·C3·C4. 구체적으로:
  1. 새 테스트 파일 `apps/desktop/src/__tests__/quick-choseong.test.ts`가 있고 **수정 전 코드에서 빨강임을 먼저 실행해 `run.md`에 남기며**, 수정 후 초록이다(red → green).
  2. 양의 단언: `quickMatch("한글 문서.txt", "ㅎㄱ")`, `quickMatch("한글 문서.txt", "한ㄱ")`, NFD로 저장된 이름도 같다. `quickMatchRange`가 일치한 음절 구간(`ㅎㄱ` → `[0, 2)`)을 돌려준다.
  3. 음의 단언: `quickMatch("abc.txt", "ㅎ")`는 false, `quickMatch("한글", "ㄴㄱ")`는 false(초성이 다르다), `match_only_prefix`가 켜져 있으면 `quickMatch("문서 한글.txt", "ㅎㄱ", true)`는 false.
  4. 기존 동작 불변: 영문 입력의 대소문자 무시 부분 일치(`quickMatch("Readme.MD", "me.m")`)와 NFC/NFD 일치가 그대로이다.
  5. `cd apps/desktop && bunx vitest run` 전체, `bun run test`, `bunx tsc --noEmit`, `cargo test -p td-vfs` 통과. `grep -c "초성" docs/07-ui-spec.md` ≥ 1.

## 작업 조각(Work slices)
- [ ] S1. `quick-choseong.test.ts`를 먼저 쓰고 현재 코드에서 **실패함을 실행해 확인**한다. — 완료 기준: 양의 단언이 수정 전에 빨강이고 음의 단언(false 기대)은 수정 전에도 통과(회귀 방지용이라 정상)함을 `run.md`에 기록한다.
- [ ] S2. `lib/names.ts`의 `quickMatch`·`quickMatchRange`에 초성 규칙을 더한다: 입력에 한글 호환 자음(`ㄱ`~`ㅎ`)이 하나라도 있으면 입력 글자마다 "이름의 같은 글자이거나, 입력이 초성 자음이고 이름 글자의 초성과 같다"로 이름 위를 미끄러지며 비교한다(부분 일치는 모든 시작 위치, 접두 일치는 0). 자음이 없으면 기존 경로를 그대로 쓴다. — 완료 기준: S1의 양·음 단언이 모두 초록, 기존 `quick-highlight.test.tsx`·`quick-select-nav.test.tsx` 통과. (depends: S1)
- [ ] S3. `docs/07-ui-spec.md`의 Quick Select 절에 "한글 초성(`ㅎㄱ`)과 `한ㄱ` 같은 혼합 입력으로 검색한다"를 한 줄 덧붙인다. — 완료 기준: `grep -c "초성" docs/07-ui-spec.md` ≥ 1. (depends: S2)
