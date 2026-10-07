<!-- forge-slug: tab-cross-pane -->
<!-- task: 101 -->
<!-- tdd: off -->
<!-- priority: high -->
# 탭을 끌어 다른 패널로 옮기고, 탭이 하나뿐이면 복사한다 (이슈 #24)

## Goal / Non-goals
- Goal: 탭을 끌어 **반대쪽 패널의 탭 줄 위**에 놓으면 그 패널로 옮긴다. 원래 패널에 탭이 둘 이상이면 **이동**(탭의 정렬·보기·방문 기록·커서·선택을 그대로 가져간다)하고, 하나뿐이면 **복사**한다(원래 패널의 탭은 그대로 두고, 반대쪽에 같은 경로의 새 탭을 만든다. 새 id, 방문 기록은 그 경로 하나로 시작). 놓을 자리는 반대쪽 탭 줄에서 놓은 위치에 가장 가까운 탭의 앞/뒤이고, 옮기거나 복사한 탭이 그 패널의 활성 탭이 되며 그 패널이 활성 패널이 된다. 원래 패널은 어떤 경우에도 탭이 0개가 되지 않는다(활성 탭은 이웃으로 옮겨 간다). 검색 결과 같은 **가상 탭은 패널 간으로 옮기지 않고 제자리에 둔다**. 같은 패널 안 순서 바꾸기와 Esc·창 blur·버튼 해제 취소는 지금과 같다.
- 요청 경위: GitHub 이슈 #24 "패널 간 탭 이동 지원"(#20 후속). 사용자가 "탭이 한 개일 때는 탭을 다른 패널에 복사"를 지시했다.
- Non-goals: 키보드 단축키·메뉴로 패널 간 탭 보내기, 파일 목록 위에 탭을 놓는 것, 가상 탭의 패널 간 이동·복사, 탭 모양 변경, 같은 패널 안 순서 바꾸기 동작 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #24
- 사전 확인(작성 시점): 탭 상태는 `store.ts`의 `panes[pane] = { tabs, active }`이고 `moveTab`(같은 패널)과 `newTab(path)`(탭 하나 생성), `reload(pane, tabId)`가 있다. `TabBar.tsx`의 끌기는 윈도 `mousemove`/`mouseup` 리스너로 직접 처리하고, 같은 패널은 누른 시점의 탭 사각형으로 놓일 자리를 정한다. 끌린 탭이 커서 밑에서 `translateX`로 움직이므로 실제 브라우저에서 `mousemove`의 `target`은 끌린 탭 자신이 되기 쉽다 — 반대쪽 탭 줄 판단은 이를 고려해야 한다(끌린 탭에 `pointer-events: none`을 주거나 반대쪽 탭 줄의 사각형으로 판단). 기존 테스트 `tab-drag-reorder.test.tsx`·`tab-drag-edges.test.tsx`(`getBoundingClientRect` 스텁 방식)가 있다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 845건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0, `docs/07-ui-spec.md`의 "패널 간 탭" 0건):
  1. 신규 `apps/desktop/src/__tests__/tab-transfer-store.test.ts`(vitest)가 스토어 `transferTab(from, index, to, toIndex)`를 값으로 단언한다: (a) 원래 패널에 탭 2개 → 이동: 원래 1개·반대쪽 +1, 옮긴 탭의 id·path·정렬·보기·방문 기록이 그대로, 반대쪽 활성이 놓은 자리, 활성 패널이 반대쪽 (b) 원래 활성 탭을 옮기면 원래 패널의 활성이 이웃 탭이고 0개가 되지 않음 (c) 원래 패널에 탭 1개 → 복사: 원래 패널의 탭 객체·id·개수 불변, 반대쪽에 같은 path의 새 탭(새 id, 방문 기록 `[path]`) (d) 가상 탭은 상태 참조가 그대로(변화 없음) (e) 범위 밖 `index`나 같은 패널이면 변화 없음, `toIndex`는 0..길이로 보정 (f) 원래 패널의 활성이 옮기지 않은 탭이면 그 탭을 계속 가리킴. 구현 전에 실패(red)해야 한다.
  2. 신규 `apps/desktop/src/__tests__/tab-drag-cross-pane.test.tsx`(vitest, `getBoundingClientRect` 스텁 + 두 탭 줄)가 단언한다: (a) 왼쪽 탭(왼쪽 탭 2개)을 오른쪽 탭 줄 위에서 놓으면 왼쪽 탭 수가 줄고 오른쪽에 그 탭이 놓일 자리에 생긴다 (b) 왼쪽이 탭 하나일 때 오른쪽 탭 줄에 놓으면 왼쪽은 그대로이고 오른쪽에 같은 이름의 탭이 생긴다 (c) 반대쪽 탭 줄 위에서 Esc를 누르면 아무것도 바뀌지 않는다 (d) 반대쪽 탭 줄이 아닌 곳(파일 목록)에서 놓으면 아무것도 바뀌지 않는다 (e) 반대쪽 탭 줄 위에 있는 동안 그 탭 줄이 놓일 곳으로 표시된다(`data-drop-target` 속성). 구현 전에 실패(red)해야 한다.
  3. 기존 `tab-drag-reorder.test.tsx`·`tab-drag-edges.test.tsx`·`pane-tab-appearance.test.tsx`가 의미 변경 없이 통과한다.
  4. `grep -c "패널 간 탭" docs/07-ui-spec.md` ≥ 1 (착수 전 0)
  5. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음)

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `tab-transfer-store.test.ts`와 `tab-drag-cross-pane.test.tsx`를 쓰고 red 기록 — completion criterion: DoD 1·2가 구현 전에 실패
- [ ] S2. 스토어 `transferTab(from, index, to, toIndex)`(이동/복사, 가상 탭 제외, 활성 보정) — completion criterion: DoD 1 green (depends: S1)
- [ ] S3. `TabBar` 끌기에서 반대쪽 탭 줄 판정·표시(`data-drop-target`)·놓기 처리, 문서 `docs/07` 갱신 — completion criterion: DoD 2·3·4·5 green (depends: S2)
