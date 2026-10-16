<!-- forge-slug: quick-hangul-assemble -->
<!-- task: 186 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 빠른 검색에서 낱개 자모를 음절로 조립한다 (이슈 #87 일부)

## 목표 / 비목표
- 목표: macOS에서 한글을 치면 `ㅎㅏㄴ`처럼 자모가 낱개로 쌓여 검색이 안 되는 문제를 푼다. 빠른 선택 버퍼가 낱개 자모를 `es-hangul`의 `assemble`로 음절로 조립하고, Backspace는 자모 단위로 지운다.
- 비목표: 초성 검색(같은 이슈의 2/2, `quick-choseong-search`), Windows 한영 전환(`loop.md`에 갈림길로 기록), 숨은 입력창 도입, 설정 키 추가, 이슈 닫기.

## 근거(코드로 확인한 사실)
- `ui/useKeyboard.ts:161-164`: `isPlainChar(e)`(`e.key.length === 1`)이면 `preventDefault()` 후 `api.quickInput(e.key)`. 조합 이벤트를 쓰지 않고 `e.key`를 한 글자씩 붙인다. 낱개 자모는 길이 1이라 그대로 들어간다.
- `state/store.ts`의 `quickInput`은 `(t.quick ?? "") + char`, `quickBackspace`는 `slice(0, -1)`. 조립도 자모 단위 삭제도 없다.
- `es-hangul`은 이미 의존성(`apps/desktop/package.json:24`)이고 `lib/helpSearch.ts`가 `disassemble`을 쓴다.
- 알려진 한계: 실제 macOS WKWebView에서 한글 IME가 보내는 `keydown`의 `e.key`가 낱개 자모인지(`isComposing`이 false인지)는 이 환경에서 확인하지 못했다. 이슈의 "자소가 떨어져서 출력"이라는 증상과 위 코드는 일치하지만, 실제 이벤트 모양은 사람이 확인해야 한다.

## 원천(Source of truth)
- 용어: 없음
- 관련 ADR: 없음
- 관련 이슈: #87 (일부 — 자모 조립만. 초성 검색은 2/2, Windows 한영 전환은 이 루프의 범위 밖이라 이슈를 닫지 않는다)
- 완료 정의(DoD): `.forge/loop.md`의 C1·C3. 구체적으로:
  1. 새 테스트 파일 `apps/desktop/src/__tests__/quick-hangul-input.test.tsx`(화면 단언)와 `apps/desktop/src/__tests__/hangul-input.test.ts`(순수 함수)가 있고 **수정 전 코드에서 빨강임을 먼저 실행해 `run.md`에 남기며**, 수정 후 초록이다(red → green).
  2. 화면 단언: `한글 문서.txt`(NFC)와 NFD로 저장된 `한글 노트.txt`가 있는 폴더에서 `ㅎㅏㄴㄱㅡㄹ`를 한 글자씩 입력하면 빠른 선택 막대의 글자가 `한글`이고 커서가 `한글 문서.txt`다. `{Backspace}` 세 번 뒤 막대 글자가 `한ㄱ` → `한`으로 줄어든다(자모 단위).
  3. 음의 단언: 영문 `zip` 입력은 기존과 같고, 영문과 자모를 섞어도(`aㅎ`) 영문이 깨지지 않는다.
  4. `cd apps/desktop && bunx vitest run` 전체와 `bunx tsc --noEmit`, `cargo test -p td-vfs`가 통과한다. 수정 전에도 통과하는 기존 `quick-select-nav.test.tsx`·`quick-highlight.test.tsx`는 회귀 방지용이라 수정 전부터 초록이 정상이다.

## 작업 조각(Work slices)
- [ ] S1. 위 두 테스트 파일을 먼저 쓰고 현재 코드에서 **실패함을 실행해 확인**한다(실패 출력 요약을 `run.md`에). — 완료 기준: 새 테스트가 수정 전에 빨강이고, 실패 이유가 "버퍼에 낱개 자모가 그대로 쌓임"이다(다른 이유의 빨강이면 테스트를 고친다).
- [ ] S2. `apps/desktop/src/lib/hangulInput.ts`를 만든다: `appendQuick(buffer, char)`는 버퍼 전체를 글자 배열로 `assemble`해 돌려주고, `backspaceQuick(buffer)`는 마지막 음절을 `disassemble`해 마지막 자모 하나를 빼고 다시 `assemble`한다. 한글이 아닌 입력은 그대로 이어 붙인다. — 완료 기준: `hangul-input.test.ts`가 초록. (depends: S1)
- [ ] S3. `store.ts`의 `quickInput`·`quickBackspace`가 위 함수를 쓰게 한다. 기존 `activate_on_any_character`·`match_only_prefix` 동작은 그대로다. — 완료 기준: `quick-hangul-input.test.tsx`가 초록, 기존 빠른 선택 테스트가 그대로 통과. (depends: S2)
- [ ] S4. `docs/07-ui-spec.md`의 Quick Select 절에 "낱개 자모는 음절로 조립되고 Backspace는 자모 단위로 지운다"를 한 줄 덧붙인다. 실제 IME 이벤트 모양을 확인하지 못했다는 한계도 한 줄로 쓴다. — 완료 기준: `grep -c "자모" docs/07-ui-spec.md` ≥ 1. (depends: S3)
