<!-- forge-slug: tab-bar-overflow-scroll -->
<!-- task: 201 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- tdd: on -->
# 탭이 많아지면 탭 줄을 가로로 스크롤한다 (이슈 #104)

## 목표 / 비목표
- 목표: 탭이 패널 폭을 넘으면 탭이 패널 밖으로 나가 보이지 않는 대신, 탭 줄(`role="tablist"`)이 가로로 스크롤되고 하단에 얇은 스크롤바가 보인다. 활성 탭은 항상 보이는 곳으로 스크롤된다.
- 비목표: 여러 줄 표시, 끌기 도중 자동 스크롤, 휠 → 가로 스크롤, 설정 키, 실제 WKWebView 확인(`loop.md` 제외 목록).

## 근거(코드로 확인한 사실)
- `ui/TabBar.tsx:140-144`: 탭 줄 컨테이너는 `flex`(칸형) 또는 `flex gap-1 px-1`(밑줄형)뿐이고 넘침 처리가 없다.
- 칸형: 탭이 `min-w-0 flex-1 truncate`(닫기 버튼이 켜지면 감싸는 `div`가 `min-w-0 flex-1`)로 균등 분할되지만 `px-6` 패딩(닫기 버튼 자리)은 줄지 않아서 탭 하나의 최소 폭이 48px이다. 탭이 많으면 합이 패널 폭을 넘는다. 밑줄형: 탭 버튼이 내용 폭을 유지하고(`flex-shrink` 기본값이어도 `min-width:auto`) 줄지 않는다.
- 끌기 계산은 모두 `getBoundingClientRect()`(화면 좌표, `ui/TabBar.tsx:35-110`)라 스크롤 컨테이너로 바꿔도 누른 시점의 위치를 그대로 쓴다. 활성 탭 인덱스는 `useApp((s) => s.panes[pane]).active`다.
- 얇은 스크롤바 스타일 `.td-thin-scroll`(6px)이 `index.css:25`에 이미 있다.
- 알려진 한계: 숨은 탭 위로 끌어다 놓기는 자동 스크롤이 없어 닿지 않는다(이번 비목표).

## 원천(Source of truth)
- 용어: 없음
- 관련 ADR: 없음
- 관련 이슈: #104 (탭 줄 가로 스크롤. 이슈 닫기는 사용자가 정한다)
- 완료 정의(DoD): `.forge/loop.md`의 C1~C4. 구체적으로:
  1. `apps/desktop/src/__tests__/tab-bar-overflow.test.tsx`가 있고 **수정 전 코드에서 빨강임을 먼저 실행해 `run.md`에 남기며**, 수정 후 초록이다(red → green). 음의 단언(탭 3개일 때 기존 모양 유지)은 수정 전에도 통과하는 것이 정상(회귀 방지용)이다.
  2. 임시 하니스로 실제 Chrome에서 C2의 (a)~(e)를 측정한다. 수정 전 측정값(실패하는 항목)과 수정 후 측정값을 `run.md`에 숫자로 남긴다. 하니스는 `apps/desktop/.verify-tabs/`에 만들고 끝나면 삭제한다(`git status`에 남지 않아야 한다).
  3. `cd apps/desktop && bunx vitest run` 전체(탭 끌기·닫기·더블클릭·포커스·색상 시험 포함), `bun run test`, `bunx tsc --noEmit` 통과.
  4. `grep -c "가로 스크롤" docs/07-ui-spec.md` ≥ 1.

## 작업 조각(Work slices)
- [ ] S1. `tab-bar-overflow.test.tsx`를 먼저 쓰고 현재 코드에서 **실패함을 실행해 확인**한다(실패 이유가 "스크롤 컨테이너가 아님"·"scrollIntoView가 불리지 않음"인지 확인해 `run.md`에 기록). 탭 40개를 만들려면 기존 `tab-bar-*`·`pane-tab-appearance.test.tsx`의 방식(스냅샷 또는 `renderApp` + 설정 변경)을 따른다. — 완료 기준: 새 단언이 수정 전에 빨강이다.
- [ ] S2. C2 측정 하니스를 `apps/desktop/.verify-tabs/`에 만들어(`FakeBackend` + 스냅샷으로 패널당 탭 30개·마지막 활성, 설정 `tab_style`·`tab_position` 4조합, Vite 개발 서버 + 헤드리스 Chrome의 `--dump-dom`) 수정 전 값을 측정해 기록한다. — 완료 기준: 수정 전에 (a)·(c)·(d) 중 하나 이상이 실패한다(측정이 문제를 잡는다). 아무 것도 실패하지 않으면 측정이 틀린 것이므로 하니스를 고친다. (depends: S1)
- [ ] S3. `TabBar.tsx`를 고친다: 탭 줄에 가로 스크롤(`overflow-x-auto overflow-y-hidden td-thin-scroll`)을 주고, 탭이 줄어들지 않게 한다(칸형은 최소 폭을 주고 `flex-1`을 유지해 여유가 있으면 균등 분할, 밑줄형은 `shrink-0 whitespace-nowrap`). 활성 탭이 바뀌거나 처음 그려질 때 그 탭을 `scrollIntoView({ block: "nearest", inline: "nearest" })`로 보이게 한다(함수가 없는 jsdom은 안전하게 건너뛴다). — 완료 기준: S1의 단언이 초록. (depends: S2)
- [ ] S4. 하니스로 수정 후 값을 측정해 C2의 (a)~(e)가 4조합 모두 통과함을 확인하고, `docs/07-ui-spec.md`의 탭 줄 설명에 "탭이 패널 폭을 넘으면 탭 줄이 가로 스크롤되고 활성 탭이 보이게 스크롤된다"와 한계(끌기 자동 스크롤 없음, 실제 WKWebView 미확인)를 적고, 하니스를 삭제한다. — 완료 기준: DoD 2·4, `git status`에 하니스 없음. (depends: S3)
