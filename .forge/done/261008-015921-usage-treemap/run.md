# RUN — Disk Usage를 treemap(사각형 타일)으로도 볼 수 있게 한다 (이슈 #25)

- S1 red 테스트 — ✅ `treemap-layout.test.ts` 11건(배치·묶기), `usage-treemap.test.tsx` 13건. 구현 전 순수 로직은 모듈 없음, 컴포넌트는 12건 실패(기본 키 단언 포함). 목록 보기의 기존 동작 단언 1건은 사전 통과(가드)
- S2 `lib/treemap.ts` — ✅ squarified `layoutTreemap`, `groupSmall`(`SMALL_RATIO = 0.005`)
- S3 스토어·액션·키 — ✅ `VirtualTab.view`("list"|"treemap"), `diskUsage(args, view)`·`diskUsageTreemap`·`toggleUsageView`·`usageRescan`(스캔 재시작)·`usageDescend`·`usageUp`·`usageOpenOther`, `open`·`goUp`·`goRight`에 treemap 분기, `ActionContext.usageTab`·`canGoUp`, `core.disk_usage.treemap`(`Mod+Alt+U`)·`core.disk_usage.toggle_view`(`Alt+T`), `docs/05`
- S4 UI — ✅ `ui/UsageTreemap.tsx`(절대 위치 `div` 타일, 크기 측정 + 폴백 800×480, 툴팁 `이름 · 크기 · 비율`, 선택 윤곽), `Pane`이 usage 탭의 treemap 보기에서 목록 대신 그림

## DoD baseline → after
1. `treemap-layout.test.ts`: 없음 → 11건 통과 (구현 전 red 확인)
2. `usage-treemap.test.tsx`: 없음 → 13건 통과 (구현 전 12건 red)
3. 기본 키: `Mod+Alt+U`·`Alt+T` 각 1번씩, mac·linux 모두 겹침 없음, `packages/actions` 테스트 19건 통과, `docs/05`의 `core.disk_usage.treemap` 0 → 1
4. 기존 `virtual-tabs`·`virtual-list`·`keyboard-scenario-m3` 통과 유지
5. vitest 859 → 883 통과(model-formats 기준선 1파일), `tsc` 0, `git diff -- crates apps/desktop/src-tauri` 비어 있음(Rust·IPC 변경 없음)

## 차이·메모 (계획과 달라진 점)
- **`neighborTile`(기하학적 이웃 타일 이동)은 만들지 않았다.** 그릴링에서 `←`/`→`를 올라가기/내려가기로 확정했는데 계획이 방향키를 이웃 이동으로도 적어 충돌했다. 확정된 쪽을 따르고, 커서 이동은 기존 목록의 크기순 이동(↑↓·Home·End·PageUp/Down)을 그대로 쓴다. 타일의 위치와 커서 이동 방향이 일치하지 않는다 — 화면에서 위/아래 키가 반드시 타일의 위/아래로 가지는 않는다.
- 전환 키 `Alt+T`: 그릴링에서는 `T`로 말씀드렸으나 수식키 없는 글자는 Quick Select가 가져가서 바꿨다(계획 본문에는 이미 반영).
- `ActionContext`에 `usageTab`을 새로 더해 전환 액션이 Disk Usage 탭에서만 쓸 수 있게 했다(`ActionBar.tsx`도 맞춤). `canGoUp`은 treemap 보기에서 `Backspace`(`core.go.up`)가 동작하도록 기준 폴더의 상위 존재 여부로 바꿨다.
- "기타" 타일은 클릭 시 묶인 첫 항목에 커서를 두고 지금 보는 폴더를 연다. 커서가 묶인 항목에 있으면 "기타" 타일이 선택 표시된다.
- 클릭은 더블클릭의 앞부분이기도 해서, 더블클릭하면 반대쪽 패널이 먼저 그 폴더를 연 뒤 treemap이 내려간다(두 동작이 같이 일어남). 의도한 지연·구분은 두지 않았다.
- 테스트에서 왼쪽 가상 탭에는 경로 표시줄이 없어(`VirtualHeader`) 기존 `crumbs("right")` 헬퍼가 맞지 않아 파일 안에서 오른쪽 경로 표시줄을 직접 읽는 헬퍼를 썼다.

## 확인하지 못한 것
- **실제 앱(WKWebView)에서는 아무것도 눈으로 보지 못했다.** 타일 모양·색·글자 크기, 크기 측정(`ResizeObserver`), 큰 폴더에서의 느낌은 jsdom 테스트로는 알 수 없다. 스캔 중에는 도착할 때마다 다시 배치하는데 항목이 수천 개일 때의 성능은 확인하지 못했다(묶기 덕에 타일 수는 보통 적다).
- 이웃 이동·확대/축소·고정 크기 폴백(800×480)이 실제 창 크기에서 어떻게 보이는지는 미확인이다.

## 후속 변경 (실행 뒤 사용자 보고)
- 사용자가 `Opt+T`를 눌러도 반응이 없다고 보고했다. 격리 인스턴스(실제 WKWebView)로 `Cmd+Opt+U`·`Opt+T`를 보내 보니 동작해서 재현하지 못했다(이 Mac은 한글 2벌식 입력기). 가장 가능성이 큰 원인은 일반 폴더 탭에서 눌러서 조용히 무시된 것(설계상 Disk Usage 탭에서만 동작)이라, 발견하기 어려운 키였다.
- 변경: `core.disk_usage.toggle_view`(`Alt+T`)가 어느 탭에서든 동작한다. 일반 폴더에서는 그 폴더를 treemap으로 열고(`core.disk_usage.treemap`과 같다), Disk Usage 탭에서는 목록 ↔ treemap을 전환한다. `isApplicable` 제한을 없앴다. 테스트 1건 추가(일반 폴더에서 Alt+T → treemap 탭, 이어서 Alt+T → 전환).
- 실제 앱 확인: treemap이 정상적으로 그려지는 것과 `Cmd+Opt+U`·`Opt+T` 전환을 격리 인스턴스로 확인했다(눈으로 본 첫 확인). 타일 색·글자·배치가 보이는 대로 괜찮은지, 사용자의 키 입력(한글 입력기 상태 포함)에서 `Opt+T`가 되는지는 사용자 확인이 필요하다.

## 정정 (봉인 뒤)
- 이 기록과 계획이 적은 `core.disk_usage.treemap`의 기본 키 `Mod+Alt+U`는 최종 구현에 없다. `Alt+T`(`core.disk_usage.toggle_view`)가 일반 폴더에서는 treemap을 열고 Disk Usage 탭에서는 목록↔treemap을 전환하게 바뀌어, 겹치는 `Mod+Alt+U`를 기본 키에서 뺐다(액션은 Actions Panel·인수용으로 남음).
