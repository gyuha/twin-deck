<!-- forge-slug: usage-q-exit -->
<!-- task: 104 -->
<!-- tdd: off -->
# Disk Usage 탭에서 q 키를 누르면 바로 나간다 (이슈 #26)

## Goal / Non-goals
- Goal: Disk Usage 탭(목록 보기·treemap 보기 모두)에서 수식키 없는 `q`를 누르면 그 탭을 **바로 닫고**(진행 중인 스캔은 취소) 이웃 탭으로 돌아간다. 그 탭이 패널의 **유일한 탭**이면(다른 탭을 모두 닫은 경우 등) 닫을 수 없으므로 기준 폴더(`virtual.base`)의 일반 탭으로 바꾼다. 수식키(Ctrl·Cmd·Alt·Shift)가 하나라도 있으면 동작하지 않는다. **Quick Select가 진행 중이면**(글자로 항목을 찾는 중) `q`는 검색어이므로 나가지 않는다. 한글 입력기에서도 되도록 글자(`e.key`)가 아니라 물리 키(`e.code === "KeyQ"`)로 판정한다. 다른 탭(일반 폴더·Look Up·Flatten·Find 결과)에서는 `q`가 지금처럼 Quick Select를 시작한다.
- 요청 경위: GitHub 이슈 #26(작성자 본인) "디스크 사용율 트리뷰 모드 개선": 디스크 사용율 모드에서 q키를 누르면 바로 나가게.
- 트레이드오프(알려 둠): Disk Usage 탭에서는 `q`로 시작하는 항목 이름을 Quick Select로 찾을 수 없다.
- Non-goals: 다른 가상 탭(Look Up·Flatten·Find)의 `q`, `q`를 설정에서 바꾸는 것, 새 액션·메뉴 항목, `Esc` 동작 변경(스캔 취소는 그대로), Rust 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #26
- 사전 확인(작성 시점): `ui/useKeyboard.ts`의 `onKeyDown`은 `e.isComposing`이면 일찍 반환하고, `scopeStack`(`store.ts`)이 Quick Select 진행 중이면 `["quickSelect","pane","global"]`, 아니면 `["pane","global"]`를 돌려준다. 바인딩이 없는 수식키 없는 글자는 `isPlainChar`로 `api.quickInput`에 간다. 키맵은 `pane` 스코프의 수식키 없는 글자 바인딩을 Quick Select 충돌로 거부한다(`keymap.ts`) — 그래서 `q`는 키맵이 아니라 `useKeyboard`의 특수 처리로 둔다. 탭 닫기는 `closeTabAt(pane, index)`(#27). 가상 탭에서 일반 위치로 나가는 `navigate`는 이미 있다(`virtual` 해제).
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 899건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0, `git diff -- crates apps/desktop/src-tauri` 비어 있음, `grep -c "q" docs/07`의 Disk Usage 절 설명 0건):
  1. 신규 `apps/desktop/src/__tests__/tab-usage-exit.test.ts`(store)가 `usageExit()`를 단언한다: (a) Disk Usage 탭이 활성이고 다른 탭이 있으면 그 탭이 닫히고 이웃이 활성 (b) 진행 중인 스캔은 `cancelSearch`로 취소 (c) 패널의 유일한 탭이면 닫지 않고 기준 폴더(`base`)의 일반 탭으로 바뀐다(`virtual` 없음, `path === base`) (d) Disk Usage가 아닌 탭에서는 상태 참조가 그대로. 구현 전에 실패(red)해야 한다.
  2. 신규 `apps/desktop/src/__tests__/usage-q-exit.test.tsx`(vitest)가 단언한다: (a) 목록 보기의 Disk Usage 탭에서 `q`를 누르면 탭이 닫히고 원래 탭으로 돌아온다 (b) treemap 보기에서도 같다 (c) `Ctrl+Q`·`Alt+Q`·`Shift+Q`·`Cmd+Q`는 닫지 않는다 (d) 한글 입력기를 흉내 낸 이벤트(`key: "ㅂ"`, `code: "KeyQ"`)도 닫는다 (e) 일반 폴더에서 `q`는 Quick Select를 시작한다(빠른 선택 표시, 탭은 그대로) (f) Disk Usage 탭에서 다른 글자로 Quick Select를 시작한 뒤 `q`를 누르면 나가지 않고 검색어가 된다 (g) 유일한 탭인 Disk Usage에서 `q`는 일반 탭(기준 폴더)으로 바꾼다. 구현 전에 실패(red)해야 한다.
  3. 기존 `usage-treemap`·`virtual-tabs`·`virtual-list`·`keyboard-scenario-m3`·`quick-select*`가 의미 변경 없이 통과한다.
  4. `docs/07-ui-spec.md`(가상 탭·Disk Usage 설명)에 `q`로 나간다는 설명이 있다(`grep -c "q" 로 시작한 줄`이 아니라 `grep -c "\`q\`" docs/07-ui-spec.md` ≥ 1).
  5. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음), `git diff --stat -- crates apps/desktop/src-tauri`가 비어 있다.

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `tab-usage-exit.test.ts`와 `usage-q-exit.test.tsx`를 쓰고 red 기록 — completion criterion: DoD 1·2가 구현 전에 실패
- [ ] S2. 스토어 `usageExit()`(탭 닫기 또는 유일한 탭이면 기준 폴더로 전환, 스캔 취소) — completion criterion: DoD 1 green (depends: S1)
- [ ] S3. `useKeyboard`에 Disk Usage 탭의 `q` 처리(Quick Select 진행 중·수식키·IME 조합 중 제외, `e.code`로 판정)와 `docs/07` 갱신 — completion criterion: DoD 2·3·4·5 green (depends: S2)
