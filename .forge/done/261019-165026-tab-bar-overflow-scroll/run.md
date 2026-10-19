<!-- forge-slug: tab-bar-overflow-scroll -->
# 실행 기록 — 탭이 많아지면 탭 줄을 가로로 스크롤한다 (이슈 #104)

## 조각별 결과
- S1 jsdom 시험 먼저, 수정 전 빨강 확인 — ✅ as planned (15개 중 13개 실패)
- S2 실제 Chrome 측정 하니스(임시), 수정 전 값 측정 — ⚠ 측정 기준을 두 번 고쳤다(아래 "측정 기준 보정")
- S3 `TabBar.tsx` 수정 — ⚠ 계획 + 보강: 활성 탭 스크롤의 의존성에 레이아웃 값(`segments`·`bottom`·`closeable`)을 더했다(실제 Chrome 측정이 잡은 결함, 아래)
- S4 수정 후 측정, `docs/07` 설명, 하니스 삭제 — ✅ as planned

## 수정 전 빨강 증거
**jsdom** (`tab-bar-overflow.test.tsx`): `13 failed | 2 passed`. 실패 이유는 의도한 그대로 — "탭 줄이 `overflow-x-auto`가 아님"(`flex gap-1 border-b … `), "`scrollIntoView`가 불리지 않음". 통과 2개는 탭 3개일 때 기존 모양(`gap-1`·`flex-1`)을 지키는 회귀 방지용.

**실제 Chrome** (헤드리스, 창 900px, 패널 폭 446px, 패널당 탭 30개·마지막 활성): 수정 전 4조합 모두 FAIL.
```
underline top    n=30 scrollW=811  clientW=446 scrollLeft=0 activeInside=False overflowX=visible h=29 => FAIL
underline bottom n=30 scrollW=811  clientW=446 scrollLeft=0 activeInside=False overflowX=visible h=29 => FAIL
segments  top    n=30 scrollW=509  clientW=446 scrollLeft=0 activeInside=False overflowX=visible h=27 => FAIL
segments  bottom n=30 scrollW=509  clientW=446 scrollLeft=0 activeInside=False overflowX=visible h=27 => FAIL
(탭 3개일 때 4조합은 scrollW=clientW=446, activeInside=True로 PASS)
```
`overflow-x: visible`이라 내용이 패널 폭을 넘쳐도 잘리거나 스크롤되지 않고, 활성(마지막) 탭이 탭 줄 안에 보이지 않는다(이슈의 증상 재현).

## 수정 후 (같은 측정, 수정 후 코드, 세 번 반복해도 같은 값)
```
underline top    n=30 tabs=30 scrollW=  815 clientW= 446 scrollLeft=  365 canScroll=True  activeInside=True  overflowX=auto    h=35 bar=6px => PASS
underline top    n= 3 tabs= 3 scrollW=  446 clientW= 446 scrollLeft=    0 canScroll=False activeInside=True  overflowX=auto    h=29 bar=0px => PASS
underline bottom n=30 tabs=30 scrollW=  815 clientW= 446 scrollLeft=  365 canScroll=True  activeInside=True  overflowX=auto    h=35 bar=6px => PASS
underline bottom n= 3 tabs= 3 scrollW=  446 clientW= 446 scrollLeft=    0 canScroll=False activeInside=True  overflowX=auto    h=29 bar=0px => PASS
segments  top    n=30 tabs=30 scrollW= 2880 clientW= 446 scrollLeft= 2434 canScroll=True  activeInside=True  overflowX=auto    h=33 bar=6px => PASS
segments  top    n= 3 tabs= 3 scrollW=  446 clientW= 446 scrollLeft=    0 canScroll=False activeInside=True  overflowX=auto    h=27 bar=0px => PASS
segments  bottom n=30 tabs=30 scrollW= 2880 clientW= 446 scrollLeft= 2434 canScroll=True  activeInside=True  overflowX=auto    h=33 bar=6px => PASS
segments  bottom n= 3 tabs= 3 scrollW=  446 clientW= 446 scrollLeft=    0 canScroll=False activeInside=True  overflowX=auto    h=27 bar=0px => PASS
FAILS: 0
```
- 스크롤바가 실제로 그려진다: 넘칠 때 6px(`td-thin-scroll`), 탭 줄 높이 29→35(밑줄형)·27→33(칸형). **탭이 적을 때는 높이 29·27 그대로, 스크롤바 0px** — 평소 모습은 변하지 않는다.
- 칸형은 탭이 96px(`min-w-24`)보다 줄지 않아 30개일 때 내용 2880px, 스크롤 끝(2434)까지 가면 마지막 탭이 보인다.

## 측정 기준 보정 (측정이 틀리지 않게 한 일)
1. 처음 판정은 `scrollWidth > clientWidth`만 봤는데 `overflow: visible`이어도 참이라 변별력이 없었다. `overflow-x`가 `auto`·`scroll`일 것을 더했다(`loop.md` C2 (a)도 같은 문구로 고침).
2. 측정 플래그 `--hide-scrollbars=false`는 스위치가 있는 것만으로 켜져 스크롤바를 숨겼다(탭 줄 높이가 그대로였던 것이 단서). 플래그를 빼고 스크롤바 두께(`offsetHeight - clientHeight - 위·아래 테두리`)를 측정에 더했다. 이슈의 "하단에 스크롤바 표시"를 직접 확인하는 값이다.

## 실제 Chrome 측정이 잡은 결함 (jsdom은 못 잡았다)
첫 수정 후 8조합 중 1조합(칸형·위)이 FAIL: 내용 2880px인데 `scrollLeft=365`(밑줄형 레이아웃의 값)에 머물러 활성 탭이 안 보였다. 앱이 처음에는 기본 모양(밑줄형)으로 그렸다가 설정이 로드되면서 칸형으로 바뀌는데, 활성 탭 스크롤 효과가 `[active, tabs.length]`에만 반응해 레이아웃이 바뀐 뒤 다시 스크롤하지 않았다. 설정에서 탭 모양·위치·닫기 버튼을 바꿀 때도 같은 문제다. 의존성에 `segments`·`bottom`·`closeable`을 더해 고쳤고 이후 3회 연속 8조합 전부 PASS.

## DoD 기준값 → 실행 후
1. `tab-bar-overflow.test.tsx` → 수정 전 13 빨강 → 수정 후 15개 초록(재렌더로 DOM 노드가 바뀌어도 맞도록 호출 시점의 패널·인덱스·선택 여부를 기록하는 방식으로 시험을 고친 뒤).
2. 실제 Chrome 측정 → 수정 전 4조합 FAIL → 수정 후 8조합 모두 PASS(위 표). 하니스(`apps/desktop/.verify-tabs/`)와 1421 포트의 임시 Vite 서버는 삭제·종료했고 `git status`에 남지 않는다.
3. `cd apps/desktop && bunx vitest run` → 186 파일 통과·1 건너뜀(1563 통과) · `bun run test` 통과 · `bunx tsc --noEmit` exit 0. 탭 끌기(`tab-drag-*` 3개)·닫기·더블클릭·포커스·색상 시험 모두 통과.
4. `grep -c "가로 스크롤" docs/07-ui-spec.md` 0 → 1.

## 결정과 발견
- **여러 줄이 아니라 가로 스크롤을 택했다**(이슈가 둘 중 하나를 골라 달라고 했다). 탭 줄 높이가 늘지 않아 파일 목록이 밀리지 않고, 끌어서 순서를 바꾸는 로직이 한 줄을 전제로 한다. 끌기 계산은 모두 `getBoundingClientRect()`(화면 좌표)라 스크롤 컨테이너에서도 그대로 동작함을 코드로 확인했고 끌기 시험이 통과한다.
- **기존 시험 2개의 기대값을 갱신했다**(`pane-tab-appearance.test.tsx`): ① 칸형 탭 `min-w-0` → `min-w-24`(이슈를 고치려면 정확히 그 속성이 바뀌어야 한다. "균등 분할·말줄임" 단언 `flex-1`·`truncate`는 그대로 유지), ② 기본 모양의 클래스 문자열 정확 일치(`toBe`)를 새 클래스(`td-thin-scroll … overflow-x-auto overflow-y-hidden`, `shrink-0 whitespace-nowrap`)로 갱신. 단언은 약화하지 않았고(여전히 정확 일치) 눈에 보이는 모양(높이·간격·색)이 탭 3개일 때 그대로임은 Chrome 측정(높이 29·27, 스크롤바 0px)으로 확인했다.
- **시험 설정 주의**: `test-setup.ts`가 `Element.prototype.scrollIntoView`를 빈 함수로 채워 두므로, 시험에서 바꿨다가 `delete`하지 않고 원래 값으로 복원한다.
- 탭 줄에 `overflow-y-hidden`을 줘서 끌기 중 탭의 그림자(`box-shadow 0 2px 8px`)가 위·아래에서 조금 잘릴 수 있다(눈으로 확인하지 못함).

## 검증하지 못한 것
- **실제 앱(WKWebView)**: Chrome(Blink)으로 레이아웃을 측정했다. WebKit의 `::-webkit-scrollbar` 스타일은 같은 문법이지만 직접 확인하지 못했다. macOS 시스템 설정의 "스크롤 막대 보기"와 무관하게 커스텀 스크롤바는 항상 그려지는 것이 일반적이다.
- 탭 끌기 도중 자동 스크롤이 없어서 보이지 않는 탭 위로는 끌어 놓을 수 없다(비목표).
- 마우스 휠(세로)로는 가로 스크롤이 되지 않는다(비목표).
