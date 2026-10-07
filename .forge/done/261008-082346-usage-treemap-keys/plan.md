<!-- forge-slug: usage-treemap-keys -->
<!-- task: 105 -->
<!-- tdd: off -->
# treemap을 보이는 대로 방향키로 조작한다 (이슈 #29)

## Goal / Non-goals
- Goal: Disk Usage **treemap 보기**에서 방향키(`←` `→` `↑` `↓`)가 화면에 보이는 **인접 타일**로 선택(커서)을 옮긴다. 지금은 `→`가 하위 폴더 진입, `←`가 상위 이동, `↑`/`↓`가 크기순 이동이라 보이는 것과 어긋난다. 새 조작은 다음과 같다.
  - `Enter`: 지금처럼 선택한 타일의 폴더를 **반대쪽 패널**에 연다(파일이면 그 파일이 있는 폴더, 커서를 그 파일에). 이미 구현돼 있으므로 바뀌지 않음을 테스트로 고정한다.
  - `Shift+→` 또는 `Mod+Enter`(mac은 `Cmd+Enter`, Windows는 `Ctrl+Enter`): 커서가 폴더 타일이면 그 폴더로 **내려가** 다시 그린다. `Shift+→`는 지금 `core.preview`에도 묶여 있으므로, **커서가 파일 타일이면 미리보기를 그대로 연다**(결정: 사용자 확인). `Mod+Enter`는 파일 타일이면 아무것도 하지 않는다.
  - `Backspace`: 지금처럼 한 단계 위(기준 폴더의 부모)로 올라간다. `←`는 더 이상 올라가지 않는다.
  - 인접 타일이 없는 방향(가장자리)에서는 커서가 그대로다(돌아가지 않는다). "기타 N개" 타일도 이동 대상이며, 그 위에서 `Enter`는 지금처럼 기준 폴더를 반대쪽에 연다.
  - `Home`/`End`는 지금처럼 크기순 처음/끝이다. 목록 보기의 방향키·`→`·`←`는 바뀌지 않는다.
- 요청 경위: GitHub 이슈 #29(작성자 본인) "TreeMap의 컨트롤이 어렵습니다": 오른쪽을 누르면 보이는 대로 오른쪽 블록으로 가야 하고, Enter는 옆 패널에 폴더를 보이게, Shift+→ 또는 Mod+Enter는 하위로, Backspace는 상위로.
- Non-goals: 목록 보기의 키, 다른 가상 탭, 설정 키 추가, treemap 타일 배치 알고리즘 변경, Rust 변경, 마우스 동작 변경(클릭·더블클릭).

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #29
- 사전 확인(작성 시점): `state/store.ts`의 `open()`은 treemap이면 `usageOpenOther()`(Enter, 이미 요구와 같음), `goUp()`은 `usageUp()`(Backspace·`←`), `goRight()`는 `usageDescend()`(`→`)이다. `core.move.up/down`은 `Up`/`Down`, `core.preview`는 `Mod+Y`/`Shift+Right`이다(`packages/actions/src/defaults.ts`). `Mod+Return`은 비어 있다. 타일 좌표는 `lib/treemap.ts`의 `layoutTreemap(items, w, h)`이 계산하고 `ui/UsageTreemap.tsx`가 컨테이너 크기로 그린다 — 인접 계산에 쓸 배치는 화면과 **같은 것**이어야 한다. 선택 타일은 `tab.cursor`가 가리키는 항목이며, "기타"에 묶인 항목의 커서는 "기타" 타일로 표시된다. `docs/05-actions-keybindings.md`의 `core.disk_usage.treemap` 행과 `docs/07-ui-spec.md`가 기존 키(`→` 진입·`←` 상위·`↑↓` 크기순)를 적고 있어 함께 고쳐야 한다. 기존 `usage-treemap.test.tsx`의 `→`/`←` 기대는 이 계약 변경으로 바뀐다(의도된 변경).
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 910건 통과 + `model-formats.test.ts` 1파일 로드 실패(jsdom에 canvas 없음, 기준선 잡음), `tsc` 0, `git diff -- crates apps/desktop/src-tauri` 비어 있음):
  1. `lib/treemap.ts`에 인접 타일 계산 순수 함수(예: `neighborTile(tiles, id, dir)`)가 있고 `treemap-layout.test.ts`가 단언한다: 고정 배치에서 네 방향 각각 시각적으로 맞는 타일을 고른다(겹치는 구간이 가장 큰 타일, 동률이면 중심이 가까운 쪽) · 가장자리에서는 `null` · 한 타일뿐일 때 `null` · 같은 입력은 같은 결과. 테스트 이름에 "인접"이 들어간다.
  2. 신규 `apps/desktop/src/__tests__/usage-treemap-keys.test.tsx`가 실제 키 이벤트로 단언한다: (a) `→`는 오른쪽 타일로 커서를 옮기고 기준 폴더는 그대로 (b) `←`는 왼쪽 타일로 옮기고 올라가지 않는다 (c) `↑`/`↓`가 위/아래 타일로 옮긴다 (d) 가장자리에서 커서가 그대로 (e) `Enter`는 반대쪽 패널에 그 폴더를 열고 기준 폴더는 그대로 (f) 폴더 타일에서 `Shift+→`가 그 폴더로 내려가 기준 폴더가 바뀐다 (g) 파일 타일에서 `Shift+→`는 미리보기를 연다 (h) 폴더 타일에서 `Mod+Enter`가 내려가고 파일 타일에서는 아무 변화가 없다 (i) `Backspace`는 한 단계 위 (j) 목록 보기에서는 `→`가 지금처럼 동작한다(treemap 전용 변경). 구현 전에 (a)(b)(c)(f)(h)가 실패(red)해야 한다.
  3. 기본 키 바인딩 목록(`packages/actions`·`fkey-bindings` 등 바인딩을 나열하는 테스트)과 키맵 충돌 검사가 통과하고, 새 바인딩(`Mod+Return` — Disk Usage 탭에서만 적용되는 액션)이 추가돼 있다.
  4. `docs/05-actions-keybindings.md`(treemap 키: 방향키 인접 이동·`Shift+→`/`Mod+Enter` 진입·`Backspace` 상위·`Enter` 반대쪽 패널)와 `docs/07-ui-spec.md`가 새 조작으로 고쳐져 있고, 옛 설명(`→`/더블클릭은 그 폴더로 내려가며, `←`는 한 단계 위)이 남아 있지 않다.
  5. 회귀 방지: 기존 `usage-treemap`·`virtual-tabs`·`virtual-list`·`keyboard-scenario-m3`·`usage-q-exit`·`tab-usage-exit` 테스트가 통과한다(의도된 변경인 `usage-treemap.test.tsx`의 `→`/`←` 기대만 새 조작으로 바꾸고 다른 단언은 약화하지 않는다). `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 `model-formats.test.ts` 외에 실패하는 파일이 없고, `git diff --stat -- crates apps/desktop/src-tauri`가 비어 있다.

## Work slices
- [ ] S1. 인접 타일 순수 함수 `neighborTile`과 `treemap-layout.test.ts` 케이스 — completion criterion: DoD 1 green
- [ ] S2. treemap 방향키 이동(스토어 액션·화면이 쓰는 배치를 스토어/함수가 알 수 있게 하는 연결)과 `←`/`→`/`↑`/`↓` 처리 교체, `Shift+→`(폴더 진입·파일 미리보기)·`Mod+Return`(진입) 바인딩과 `Backspace` 유지, `usage-treemap-keys.test.tsx`와 기존 `usage-treemap.test.tsx`의 `→`/`←` 기대 갱신 — completion criterion: DoD 2·3·5 green (depends: S1)
- [ ] S3. `docs/05`·`docs/07` 갱신 — completion criterion: DoD 4 (depends: S2)
