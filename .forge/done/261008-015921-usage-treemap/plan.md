<!-- forge-slug: usage-treemap -->
<!-- task: 102 -->
<!-- tdd: on -->
<!-- priority: medium -->
# Disk Usage를 treemap(사각형 타일)으로도 볼 수 있게 한다 (이슈 #25)

## Goal / Non-goals
- Goal: 폴더의 용량을 space-radar처럼 **크기에 비례한 사각형 타일(treemap)**로 보여 준다. 기존 Disk Usage 가상 탭(`kind: "usage"`)에 **보기 전환(목록 ↔ Treemap)**을 더하고, 같은 스캔 결과(`startDiskUsage`가 주는 바로 아래 항목의 크기)를 그대로 쓴다 — 새 Rust 스캔 코드는 없다.
  - **열기**: 새 액션 `core.disk_usage.treemap`(기본 키 `Mod+Alt+U` — macOS `Cmd+Option+U`, 그 밖 `Ctrl+Alt+U`)이 같은 Disk Usage 탭을 처음부터 Treemap 보기로 연다. 기존 `core.disk_usage`(키 없음)는 목록 보기로 연다. 전환 액션 `core.disk_usage.toggle_view`(기본 키 `Alt+T`)가 Disk Usage 탭에서 목록 ↔ Treemap을 바꾼다. (`T` 같은 수식키 없는 글자는 Quick Select가 가져가므로 `Alt+T`로 정했다.)
  - **타일**: 폴더는 색을 달리한 타일, 파일은 회색 타일. 면적은 크기에 비례(squarified treemap). 전체 면적의 **0.5% 미만**인 항목은 하나의 회색 "기타 N개 · 합계 크기" 타일로 묶는다(항목이 하나뿐이면 묶지 않는다). 임계값은 설정이 아니라 상수다. 타일에는 이름·크기를 넣을 수 있을 만큼 클 때만 글자를 쓰고, 마우스를 올리면(툴팁) 이름·크기·비율이 보인다. 스캔이 진행되는 동안에는 도착한 항목으로 계속 다시 배치한다.
  - **조작**: 방향키는 위치가 가장 가까운 이웃 타일로 커서를 옮긴다. 타일을 클릭하거나 `Enter`를 누르면 **반대쪽 패널에 그 폴더를 연다**(파일 타일은 그 파일이 있는 폴더를 열고 커서를 그 파일에 둔다, "기타" 타일은 지금 보는 폴더를 연다). treemap 탭은 그대로 남는다. **더블클릭 또는 `→`**는 그 폴더를 새 기준으로 treemap을 다시 그린다(그 폴더로 스캔을 다시 시작, 파일 타일에는 동작 없음). **`Backspace` 또는 `←`**는 한 단계 위 폴더로 올라가 다시 그린다(스캔을 시작한 폴더보다 위로도 올라갈 수 있으나 파일 시스템 루트에서 멈춘다). `Esc`는 진행 중인 스캔을 취소하고 그때까지의 결과를 남긴다(기존 동작).
  - 아카이브 안(`x.zip!/…`)에서도 기존 Disk Usage처럼 동작한다.
- 요청 경위: GitHub 이슈 #25(작성자 본인) — https://github.com/zz85/space-radar 를 참고해 폴더의 스페이스를 보는 기능, 단축키는 중복되지 않게. 그릴링에서 모양은 Sunburst가 아니라 **Treemap**(사용자 선택), 표시 위치는 **가상 탭**, 타일 활성화는 **반대쪽 패널에 폴더 열기**, 내려가기는 **더블클릭/→**, 작은 항목은 **"기타"로 합치기(상수)**로 정했다.
- Non-goals: Sunburst, 폴더 타일 안에 하위 폴더를 겹쳐 그리는 중첩 treemap, 큰 창으로 따로 띄우기, 임계값·색상 설정 키, 새 Rust 스캔 코드·IPC, treemap 위에서의 복사·삭제·드래그, Disk Usage 외 다른 가상 탭의 treemap, D3 같은 새 시각화 라이브러리(SVG 또는 절대 위치 `div`를 직접 그린다).

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #25
- 사전 확인(작성 시점): Disk Usage는 `core.disk_usage`(`actions.ts:21` → `api.diskUsage`, `store.ts:2820`)가 `openVirtual("usage", …, () => backend.startDiskUsage(src))`로 가상 탭을 만들고, 이벤트 `usage`(`applySearchEvent`, `store.ts:753`)가 `entries`(`UsageItem`: 이름·경로·종류·바이트·파일 수·`done`)와 `virtual.totalBytes`를 채운다. `Pane.tsx`는 가상 탭이면 `VirtualHeader` + `FileTable`을 그린다. `core.disk_usage`에는 기본 키가 없다. 키 해석은 `ui/useKeyboard.ts`(수식키 없는 글자는 `api.quickInput`), 기본 바인딩은 `packages/actions/src/defaults.ts`, 처리기는 `apps/desktop/src/actions.ts`, 문서는 `docs/05-actions-keybindings.md`. 반대쪽 패널에 폴더를 여는 API는 `api.navigate(path, focusName?, how?, pane)`(마지막 인수가 패널). 기존 가상 탭 테스트: `virtual-tabs.test.tsx`(`runAction(user, "core.disk_usage")`, `backend.searchesStarted`). 사용자 확인 사항: 파일 시스템에서 루트 위로는 올라가지 않는다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 859건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0, `grep -c "core.disk_usage.treemap" docs/05-actions-keybindings.md` → 0, `git diff --stat -- crates apps/desktop/src-tauri`가 비어 있음 — 이 작업은 Rust·IPC를 바꾸지 않는다):
  1. 신규 `apps/desktop/src/__tests__/treemap-layout.test.ts`(vitest, 순수 로직 `lib/treemap.ts`)가 값으로 단언한다: (a) `layoutTreemap(items, w, h)`의 모든 타일이 `[0,w]×[0,h]` 안에 있고 서로 겹치지 않는다 (b) 타일 면적 합이 `w*h`(오차 1e-6)이고 각 타일 면적이 값에 비례한다 (c) 값이 0 이하인 항목은 타일이 없다 (d) 같은 입력은 같은 결과(결정적)이고 큰 항목이 먼저다 (e) 항목 1개는 영역 전체를 채운다, 빈 입력은 빈 배열 (f) `groupSmall(items, ratio)`이 임계 미만 항목을 합계·개수를 가진 하나의 `other` 항목으로 묶는다, 임계 미만이 하나뿐이면 묶지 않는다, 임계 미만이 없으면 그대로 (g) `neighborTile(tiles, id, dir)`이 위/아래/왼/오른쪽에서 중심이 가장 가까운 타일을 고르고 그 방향에 타일이 없으면 `null`. 구현 전에 실패(red, 모듈 없음)해야 한다.
  2. 신규 `apps/desktop/src/__tests__/usage-treemap.test.tsx`(vitest, 가짜 백엔드)가 단언한다: (a) 액션 `core.disk_usage.treemap`이 Disk Usage 탭을 Treemap 보기로 열고 목록 대신 타일(`role="img"` 영역 `aria-label="용량 treemap"` 안의 타일들)이 보인다, `core.disk_usage`는 목록 보기로 연다 (b) `core.disk_usage.toggle_view`가 목록 ↔ Treemap을 바꾼다(탭·스캔·항목은 그대로, 새 스캔이 시작되지 않는다) (c) 타일 이름·크기·"기타 N개"가 보이고 임계 미만 항목은 "기타"로 묶인다 (d) 폴더 타일을 클릭하거나 Enter를 누르면 **반대쪽 패널**이 그 폴더로 이동하고 treemap 탭은 그대로다, 파일 타일은 그 파일이 있는 폴더를 연다, "기타" 타일은 지금 보는 폴더를 연다 (e) 폴더 타일 더블클릭 또는 `→`가 그 폴더로 새 스캔을 시작하고(`backend.searchesStarted`에 `["usage", <하위 경로>, …]`가 추가) 제목·기준 폴더가 바뀐다, 파일 타일에서는 새 스캔이 없다 (f) `Backspace`/`←`가 한 단계 위 폴더로 스캔을 다시 시작하고 루트에서는 아무 일도 하지 않는다 (g) 방향키가 이웃 타일로 커서를 옮기고(선택 표시 `aria-selected`) 일반 목록의 `core.move.*`와 충돌하지 않는다 (h) `Esc`가 진행 중 스캔을 취소하고 결과를 남긴다 (i) 타일에 마우스를 올리면(`title`) 이름·크기·비율이 보인다. 구현 전에 실패(red)해야 한다.
  3. `defaults.ts`에 `core.disk_usage.treemap`(`Mod+Alt+U`)과 `core.disk_usage.toggle_view`(`Alt+T`)가 각각 정확히 한 번 있고, 기존 바인딩과 겹치지 않으며(`packages/actions` 테스트가 통과), `actions.ts`에 처리기가 있다(`missingHandlers`가 비어 있다). `grep -c "core.disk_usage.treemap" docs/05-actions-keybindings.md` ≥ 1.
  4. 기존 `virtual-tabs.test.tsx`·`virtual-list.test.tsx`·`keyboard-scenario-m3.test.tsx`의 Disk Usage 목록 동작이 의미 변경 없이 통과한다.
  5. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음), `git diff --stat -- crates apps/desktop/src-tauri`가 비어 있다.

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `treemap-layout.test.ts`(순수 로직)와 `usage-treemap.test.tsx`를 쓰고 red 기록 — completion criterion: DoD 1·2가 구현 전에 실패
- [ ] S2. `lib/treemap.ts`: squarified `layoutTreemap`, `groupSmall`(0.5% 상수), `neighborTile` — completion criterion: DoD 1 green (depends: S1)
- [ ] S3. 스토어·액션·키: `VirtualTab.view`("list"|"treemap"), `core.disk_usage.treemap`·`core.disk_usage.toggle_view` 액션과 기본 키, 내려가기(`usageDescend`)·올라가기(`usageUp`, 스캔 재시작)·반대쪽 패널 열기, `docs/05` 갱신 — completion criterion: DoD 3 green, DoD 2의 (a)(b)(d)(e)(f) 일부 green (depends: S2)
- [ ] S4. UI: `UsageTreemap` 컴포넌트(타일·"기타"·툴팁·커서 표시·진행 중 재배치), `Pane`에서 usage 탭의 Treemap 보기일 때 파일 목록 대신 그림, 방향키·Enter·더블클릭·Backspace·Esc 처리가 일반 목록 키와 충돌하지 않게 한다 — completion criterion: DoD 2 전부·4·5 green (depends: S3)
