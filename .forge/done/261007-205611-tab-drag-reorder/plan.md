<!-- forge-slug: tab-drag-reorder -->
<!-- task: 86 -->
<!-- tdd: off -->
# 탭을 포인터로 끌어 같은 패널 안에서 순서를 바꾼다

## Goal / Non-goals
- Goal: 패널에 탭이 둘 이상일 때 `TabBar.tsx`의 탭을 포인터(눌러서 끌기)로 같은 패널의 다른 위치에 놓아 순서를 바꾼다. 활성 탭은 끌려간 탭을 따라 움직이고(활성 탭이 아닌 탭을 옮기면 활성 탭은 그 탭 그대로), 순서는 앱 상태에 저장되어 다음 실행에도 유지된다. 가상 탭(검색 결과 등)도 일반 탭처럼 옮긴다. 제자리에 놓거나 끌기 임계(몇 px) 미만으로 움직이면 아무것도 바뀌지 않고, 단순 클릭은 지금처럼 그 탭으로 전환한다.
- 요청 경위: GitHub 이슈 #20 "탭 위치 이동 기능" — 복수의 탭에서 drag로 탭 위치를 바꾸는 기능.
- Non-goals: 다른 패널로 탭 옮기기, 키보드 단축키로 탭 순서 바꾸기, 새 액션·기본 키 추가, 파일 드래그(`DragLayer.tsx`, 스토어 `drag` 상태) 변경, 탭 모양(밑줄/칸) 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #20
- 사전 확인(작성 시점): `TabBar.tsx`는 탭마다 `button role="tab"`이고 `onClick`으로 `api.activate(pane, i)`만 한다(드래그 처리 없음). 탭 목록은 스토어 `panes[pane] = { tabs, active }`이며 `closeTab`/`newTab`/`cycleTab`이 그 모양을 바꾼다. 이 저장소의 드래그는 HTML5 DnD가 아니라 자체 포인터 이벤트다(`AGENTS.md`). 파일 드래그와 섞이지 않게 탭용 상태·핸들러는 따로 둔다. 기존 테스트는 `pane-tab-appearance.test.tsx`(탭 클래스 단언)가 있어 클래스 문자열을 바꾸면 같이 고쳐야 한다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 803건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 스토어에 `moveTab(pane, from, to)`가 생기고 신규 테스트가 값으로 단언한다: (a) 순서가 바뀐다(`[A,B,C]`에서 `0→2` → `[B,C,A]`), (b) 활성 탭이 옮긴 탭이면 `active`가 새 위치를 가리키고, 활성이 아닌 탭을 옮겨도 활성 탭의 **id**가 그대로다, (c) 가상 탭의 `virtual` 필드가 보존된다, (d) 범위 밖 인덱스나 `from === to`는 상태를 바꾸지 않는다(같은 참조). 구현 전에 실패(red)해야 한다.
  2. 컴포넌트 테스트(vitest + testing-library, 탭 3개): 탭 0을 눌러 임계 이상 오른쪽으로 끌어 탭 2 위에서 놓으면 탭 이름 순서가 바뀌고 활성 탭이 따라간다(red 후 green). 임계 미만으로만 움직이면 순서가 같고 클릭 전환이 동작한다. 제자리에서 놓아도 같다.
  3. 끌어서 순서를 바꾼 뒤의 스냅샷(저장될 상태)의 탭 순서가 새 순서다.
  4. 회귀 방지: `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음). `git diff --stat -- apps/desktop/src/ui/DragLayer.tsx` 가 비어 있다.

## Work slices
- [ ] S1. 먼저 실패하는 테스트: DoD 1의 스토어 테스트는 `apps/desktop/src/__tests__/tab-move-store.test.ts`에, DoD 2·3의 컴포넌트 테스트는 `apps/desktop/src/__tests__/tab-drag-reorder.test.tsx`에 쓰고 red를 기록한다 — completion criterion: DoD 1 (a)~(d)와 DoD 2가 구현 전에 실패한다
- [ ] S2. 스토어에 `moveTab(pane, from, to)`를 넣고 `Api` 타입에도 올린다 — completion criterion: DoD 1 green (depends: S1)
- [ ] S3. `TabBar.tsx`에 포인터 끌기를 붙인다: 눌러서 임계 이상 움직이면 끌기 시작, 놓은 위치의 탭 인덱스로 `moveTab`, 끌기 중에는 놓일 위치를 보여 주는 표시(선 하나면 충분), 임계 미만이면 지금처럼 클릭 전환 — completion criterion: DoD 2·3 green, DoD 4 (depends: S2)
