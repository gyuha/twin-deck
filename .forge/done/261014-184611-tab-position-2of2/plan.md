<!-- forge-slug: tab-position-2of2 -->
<!-- task: 159 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# 탭 위치 옵션 2/2: 탭 막대를 패널 하단에 그리기·테스트·문서 (이슈 #67)

## 목표 / 비목표
- 목표: `behavior.layout.tab_position`이 `"bottom"`이면 각 패널에서 탭 막대(`TabBar`)를 파일 목록 뒤(패널 하단)에 그린다. 위치는 CSS `order`가 아니라 `ui/Pane.tsx`의 렌더 순서(DOM 순서)로 정한다. `ui/TabBar.tsx`는 하단일 때 경계선을 막대 위쪽(`border-t`)에, 활성 탭 강조선을 탭 위쪽에 둔다(`underline`·`segments` 두 스타일 모두). 1/2가 만든 설정 키를 쓴다.
- 제약: 탭 끌기(순서 바꾸기·반대쪽 패널로 복사)는 `TabBar`가 `[role="tablist"]` 좌표로 반대쪽 막대를 찾으므로 위치가 바뀌어도 동작해야 한다. 기본값(`top`)에서는 화면이 이전과 같아야 한다.
- 비목표: 탭 막대 숨기기, 왼쪽/오른쪽 배치, 패널별 위치, 새 단축키·액션.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음. 선행: `tab-position-1of2`(소프트 순서, 막지는 않지만 1/2 없이는 설정 키가 없다).
- 정의 완료(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/tab-position.test.tsx` 통과(작성 시점: 파일 없음 → 앞으로 향하는 확인). 테스트는 (a) `"bottom"`이면 두 패널 모두 `role="tablist"`가 `role="listbox"` 뒤에, (b) `"top"`·기본값이면 앞에(`compareDocumentPosition`), (c) `underline`·`segments`에서 하단일 때 `border-t`·활성 탭 강조선 위쪽, 상단일 때는 이전과 같음(`border-b`·아래쪽), (d) 탭 수·활성 탭이 위치와 무관하게 같음을 단언한다.
  2. `grep -c tab_position docs/06-config-plugins.md docs/07-ui-spec.md` 파일마다 ≥ 1(작성 시점 0·0 → 앞으로 향하는 확인).
  3. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 전체 통과(기존 탭 끌기·닫기·전환 테스트 포함 회귀 방어; 병렬 간헐 실패는 단독 재실행으로 통과하면 인정).

## 작업 조각
- [ ] S1. `ui/Pane.tsx`에서 `tab_position`이 `"bottom"`이면 `TabBar`를 파일 목록·터미널 영역 뒤에 그린다(위쪽의 `DriveBar`는 그대로). `ui/TabBar.tsx`에 하단 모양(경계선·강조선)을 더한다. — 완료 기준: DoD 1의 (a)(b)(c).
- [ ] S2. 테스트 `tab-position.test.tsx`를 쓰고 전체 검증을 돌린다. — 완료 기준: DoD 1·3. (depends: S1)
- [ ] S3. `docs/06-config-plugins.md`의 `behavior.layout` 예시와 `docs/07-ui-spec.md`의 탭 설명에 `tab_position`을 적는다. — 완료 기준: DoD 2. (depends: S2)
