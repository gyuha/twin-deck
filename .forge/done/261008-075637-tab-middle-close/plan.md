<!-- forge-slug: tab-middle-close -->
<!-- task: 103 -->
<!-- tdd: off -->
# 탭을 마우스 가운데 버튼으로 클릭하면 닫는다 (이슈 #27)

## Goal / Non-goals
- Goal: 탭을 마우스 **가운데 버튼**으로 클릭하면 **그 탭**이 닫힌다(활성 탭이든 아니든, 어느 패널의 탭이든). 닫는 규칙은 기존 `core.tab.close`와 같다: 패널의 **마지막 탭은 닫지 않고**(아무 일도 없음), 가상 탭(검색 결과·Disk Usage)이면 진행 중인 스캔을 멈춘다. 활성 탭을 닫으면 활성은 이웃 탭으로, 다른 탭을 닫으면 활성 탭은 그대로 같은 탭을 가리킨다. 다른 패널의 탭을 닫아도 활성 패널은 바뀌지 않는다. 가운데 버튼은 탭 끌기·활성화를 시작하지 않고, 윈도의 가운데 클릭 자동 스크롤도 막는다.
- 요청 경위: GitHub 이슈 #27(작성자 본인) "탭에서 마우스 가운데 키를 누르면 닫히도록".
- Non-goals: 닫기 단축키·액션 변경, 닫은 탭 복원, 확인 창, 탭 줄의 빈 곳 클릭, 마지막 탭 규칙 변경, 가운데 버튼의 다른 용도(링크·목록).

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #27
- 사전 확인(작성 시점): `store.ts`의 `closeTab()`은 활성 패널의 활성 탭만 닫고(`p.tabs.length <= 1`이면 반환, `stopSearch`, 활성은 `min(active, 길이-1)`) `syncWatches`를 부른다. `core.tab.close`(`Mod+W`)가 이를 부른다. `TabBar.tsx`의 `onMouseDown`은 왼쪽 버튼(`e.button !== 0`이면 반환)에서만 끌기를 시작하고, `onClick`이 `api.activate`한다. WebKit(macOS)과 달리 Windows는 가운데 버튼 `mousedown` 기본 동작이 자동 스크롤이라 `preventDefault`가 필요하다. 가운데 클릭은 `auxclick`(button 1)로 오고, 닫기는 `mousedown`이 아니라 `auxclick`(뗄 때)에서 해야 다음 탭 위에서 뗐을 때 엉뚱한 탭이 닫히지 않는다. `docs/07-ui-spec.md` §3에 "탭을 다른 패널로 옮기는 기능은 P2 이후로 미룬다"는 줄이 있는데 #24로 구현되어 낡았다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 884건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0, `git diff -- crates apps/desktop/src-tauri` 비어 있음, `grep -c "가운데" docs/07-ui-spec.md`의 탭 절 0건, `grep -c "P2 이후로 미룬다" docs/07-ui-spec.md` 1):
  1. 신규 `apps/desktop/src/__tests__/tab-close-at.test.ts`(store)가 `closeTabAt(pane, index)`를 값으로 단언한다: (a) 활성이 아닌 탭을 닫으면 그 탭만 사라지고 활성 탭은 같은 id (b) 활성 탭을 닫으면 활성이 이웃(같은 인덱스, 마지막이면 앞)으로 (c) 앞쪽 탭을 닫아도 활성이 같은 탭을 가리킴 (d) 탭이 하나뿐이면 상태 참조가 그대로 (e) 범위 밖 인덱스는 변화 없음 (f) 다른 패널의 탭을 닫아도 `activePane`은 그대로 (g) 가상 탭을 닫으면 `cancelSearch`가 불린다. 구현 전에 실패(red)해야 한다.
  2. 신규 `apps/desktop/src/__tests__/tab-middle-close.test.tsx`(vitest)가 단언한다: (a) 가운데 버튼(`auxclick` button 1)으로 비활성 탭을 누르면 그 탭이 닫히고 활성 탭은 그대로 (b) 활성 탭이면 닫히고 이웃이 활성 (c) 탭이 하나뿐이면 아무 일 없음 (d) 오른쪽 패널의 탭도 닫히고 활성 패널은 그대로 (e) 왼쪽 클릭·오른쪽 클릭(button 2)은 닫지 않음 (f) 가운데 버튼 `mousedown` 뒤 움직여도 탭 순서가 바뀌지 않고 `mousedown`의 기본 동작이 막힘(`defaultPrevented`). 구현 전에 실패(red)해야 한다.
  3. 기존 `tab-switch`·`tab-drag-reorder`·`tab-drag-edges`·`tab-drag-cross-pane`·`pane-tab-appearance`가 의미 변경 없이 통과한다.
  4. `docs/07-ui-spec.md` §3에 가운데 클릭으로 닫는다는 설명이 있고(`grep -c "가운데 버튼" docs/07-ui-spec.md` ≥ 1), 낡은 "P2 이후로 미룬다" 줄은 없다(→ 0).
  5. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음), `git diff --stat -- crates apps/desktop/src-tauri`가 비어 있다.

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `tab-close-at.test.ts`와 `tab-middle-close.test.tsx`를 쓰고 red 기록 — completion criterion: DoD 1·2가 구현 전에 실패
- [ ] S2. 스토어 `closeTabAt(pane, index)`를 만들고 기존 `closeTab()`이 이를 쓰게 한다 — completion criterion: DoD 1 green, 기존 닫기 동작 유지 (depends: S1)
- [ ] S3. `TabBar`에 가운데 버튼 처리(`onAuxClick`, `mousedown` 기본 동작 방지)와 `docs/07` 갱신 — completion criterion: DoD 2·3·4·5 green (depends: S2)
