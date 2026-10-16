<!-- forge-slug: quick-hangul-assemble -->
# 실행 기록 — 빠른 검색에서 낱개 자모를 음절로 조립한다 (이슈 #87 일부, 1/2)

## 조각별 결과
- S1 테스트 먼저, 수정 전 빨강 확인 — ✅ as planned
- S2 `lib/hangulInput.ts`(`appendQuick`·`backspaceQuick`) — ✅ as planned
- S3 `store.ts`의 `quickInput`·`quickBackspace`에 연결 — ✅ as planned (import 한 줄 + 두 줄 교체)
- S4 `docs/07-ui-spec.md` 4.4절에 설명과 한계 — ✅ as planned

## 수정 전 빨강 증거 (S1)
- `quick-hangul-input.test.tsx`: 4개 중 3개 실패. 이유는 의도한 그대로다 — `expected 'ㅎㅏㄴㄱㅡㄹ' to be '한글'`(빠른 선택 막대에 낱개 자모가 쌓임, 이슈의 증상). 영문 입력 테스트 1개는 대조군이라 수정 전에도 통과.
- `hangul-input.test.ts`: 모듈이 없어서 `Failed to resolve import "../lib/hangulInput"`로 파일 전체가 실패(순수 함수 시험이라 내용 단언의 빨강은 모듈이 생긴 뒤 초록으로만 확인됨).

## DoD 기준값 → 실행 후
1. 새 테스트 2파일 → 수정 전 빨강(위) → 수정 후 9개 모두 초록.
2. 화면 단언: 막대 `한글`, `한글 문` 뒤 커서 `한글 문서.txt`, NFD 이름 `한글 노트.txt` 일치, Backspace 순서 `한글`→`한그`→`한ㄱ`→`한` → 모두 통과.
3. 음의 단언: `zip` 입력 막대 `zip`·커서 `zip-a.txt`, Backspace 후 `zi` → 통과.
4. `cd apps/desktop && bunx vitest run` → 167 파일 통과·1 건너뜀(1424 통과) · `bunx tsc --noEmit` exit 0 · `cargo test -p td-vfs` 24 통과·실패 0.
5. `grep -c "자모" docs/07-ui-spec.md` → 0 → 1.

## 결정과 발견
- `es-hangul`의 `assemble`을 실측했다: `assemble(["ㅎ","ㅏ","ㄴ","ㄱ","ㅡ","ㄹ"])`는 `한글`이지만 `assemble(["한","ㄴ"])`은 `한ㄴ`이다(받침이 아니라 새 글자). 그래서 한 글자씩 덧붙이지 않고 **버퍼 전체를 글자 배열로 매번 다시 조립**한다(`한` + `ㄱ`,`ㅡ`,`ㄹ`을 이어도 `한글`이 된다).
- Backspace는 마지막 글자를 `disassemble`해 자모 하나만 빼고 다시 조립한다.
- **검증하지 못한 것**: 실제 macOS WKWebView에서 한글 IME가 보내는 `keydown`의 `e.key`가 낱개 자모인지(그리고 `e.isComposing`이 false인지)는 이 환경에서 확인하지 못했다. 테스트는 낱개 자모 `keydown`을 합성해 넣는다. 코드 읽기만으로는 이슈의 증상과 일치하지만, 실제 앱에서 한글이 제대로 검색되는지는 사람이 macOS에서 확인해야 한다. 이슈는 닫지 않는다.
