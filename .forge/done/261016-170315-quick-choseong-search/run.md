<!-- forge-slug: quick-choseong-search -->
# 실행 기록 — 빠른 검색에서 한글 초성으로 검색한다 (이슈 #87 일부, 2/2)

## 조각별 결과
- S1 테스트 먼저, 수정 전 빨강 확인 — ✅ as planned (9개 중 6개 실패, 3개는 회귀 방지용 통과)
- S2 `lib/names.ts`의 `quickMatch`·`quickMatchRange`에 초성 규칙 — ⚠ 계획 + 두 가지 보강: (1) 입력이 이름보다 길면 먼저 -1(접두 일치에서 `undefined`가 `getChoseong`에 넘어가는 것을 막음, 테스트 1줄 추가), (2) 한글 호환 자음 범위를 `/[ㄱ-ㅎ]/`가 아니라 `/[ㄱ-ㅎ]/`로 썼다(아래)
- S3 `docs/07-ui-spec.md` 4.4절에 초성 설명 — ✅ as planned

## 수정 전 빨강 증거 (S1)
`bunx vitest run src/__tests__/quick-choseong.test.ts` (수정 전): `6 failed | 3 passed`.
- 실패 6: 초성만 입력(`ㅎㄱ`·`ㅁㅅ`·`ㅎ`), 음절+초성 혼합, NFD 이름, 접두 일치 설정, `quickMatchRange` 범위 2개 — 모두 `expected false to be true` 또는 `expected null to deeply equal [...]`로 의도한 이유.
- 통과 3(회귀 방지용이라 정상): 초성이 다르거나 입력이 이름보다 긴 경우 false, 영문 입력의 대소문자 무시 부분 일치, `quickMatchRange`가 일치하지 않으면 null.

## DoD 기준값 → 실행 후
1. `quick-choseong.test.ts` → 수정 전 6 빨강 → 수정 후 9개(입력이 더 긴 접두 일치 단언 1줄 추가 후 모두) 초록.
2. 양·음 단언 → 통과(`ㅎㄱ`·`한ㄱ`·`한글 ㅁㅅ`·NFD, `abc.txt`/`ㅎ` false, `ㄴㄱ` false, 접두 일치에서 `문서 한글.txt`는 false).
3. 기존 동작 불변 → `quick-highlight.test.tsx`(7)·`quick-select-nav.test.tsx`(4)·`quick-hangul-input.test.tsx`(4) 통과, 영문 `Readme.MD`/`me.m` 통과.
4. `cd apps/desktop && bunx vitest run` → 168 파일 통과·1 건너뜀(1433 통과) · `bun run test`(모든 워크스페이스) 통과 · `bunx tsc --noEmit` exit 0 · `cargo test -p td-vfs` 24 통과.
5. `grep -c "초성" docs/07-ui-spec.md` → 0 → 1, `grep -c "자모" docs/07-ui-spec.md` → 1(#186에서 추가).

## 결정과 발견
- **한글 문자를 코드에 쓰지 않는다**: 처음 `const CHOSEONG_INPUT = /[ㄱ-ㅎ]/`를 썼더니 전체 vitest의 `i18n-no-hardcoded.test.ts`("주석이 아닌 곳에 한글이 남은 파일 목록이 allowlist와 정확히 같다")가 `lib/names.ts`를 잡았다. 이 점검은 화면 문구를 사전에 두게 하는 규칙이고 `allowlist.json`은 끝나면 빈 목록이어야 한다. 문자 범위는 화면 문구가 아니지만 규칙의 목적(빈 목록)을 흐리지 않으려고 허용 목록에 추가하는 대신 코드 포인트(`ㄱ-ㅎ`)로 바꿨다.
- 초성 비교는 이름 위를 글자 단위로 미끄러진다: 입력 글자가 한글 호환 자음이면 이름 글자의 `getChoseong`과 비교, 그 밖의 글자는 동일 비교. 입력에 자음이 없으면 기존 `indexOf`/`startsWith` 경로를 그대로 쓴다(영문·완성형 한글 입력의 동작 불변).
- 입력 도중의 미완성 음절(`하`가 `한`에 일치)은 비목표라 지원하지 않는다. 사용자가 `ㅎㅏ`까지 쳤을 때는 `하`로 보이고 `한`으로 시작하는 이름에는 아직 일치하지 않는다(`ㄴ`을 더하면 `한`이 되어 일치). 문서에 한 줄 적었다.
- **검증하지 못한 것**: 실제 macOS IME 이벤트 모양(#186과 같음), Windows 한영 전환(`loop.md`에서 범위 밖으로 둔 갈림길). 이슈는 닫지 않는다.
