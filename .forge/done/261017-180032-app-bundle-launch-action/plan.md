<!-- forge-slug: app-bundle-launch-action -->
<!-- task: 194 -->
<!-- tdd: off -->
# `.app` 번들을 실행하는 액션을 더한다 — `Shift+Enter` (이슈 #90)

## Goal / Non-goals
- Goal: `Enter`(와 우클릭 "열기", 둘 다 `core.open`)는 지금처럼 `.app` 폴더의 내용으로 들어간다. 새 액션 `core.open.launch`(기본 키 `Shift+Return`)는 커서가 로컬 `.app` 폴더일 때 안으로 들어가지 않고 OS 기본 열기(`backend.openPath`, macOS `open`)로 앱을 실행한다. `.app`이 아닌 항목에서는 `Enter`와 똑같이 동작한다.
- Non-goals: `Enter`·우클릭 "열기"의 기본 동작 변경(사용자가 "지금처럼 내용으로 들어감"을 골랐다). 우클릭 메뉴·"다음으로 열기" 하위 메뉴에 항목 추가. Rust·Tauri 명령·`Backend` 인터페이스·생성 바인딩 변경(`open_path`는 폴더 경로도 이미 `open`에 넘긴다). 원격(`sftp://`·`ftp://`)·압축 안 경로의 실행. OS 판별(스토어는 OS를 모르므로 이름이 `.app`인 로컬 폴더면 OS와 무관하게 `openPath`를 부르고, 실제 동작은 Rust의 OS별 `open_command`가 정한다). 버전 올리기·CHANGELOG.

## Source of truth
- Glossary terms: none
- Related ADRs: none (`docs/05-actions-keybindings.md`의 `core.open` 행, `crates/td-launch`의 `open_command`)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/app-bundle-launch.test.tsx` 종료 코드 0, 테스트 6개 이상 통과 (파일이 없는 지금은 실패 — 앞으로 가야 할 검사). 시험은 최소 이 여섯을 단언한다: (a) 커서가 로컬 `.app` 폴더일 때 `Shift+Enter` → `FakeBackend.opened`에 그 경로가 들어가고 활성 탭의 경로는 그대로다(안으로 들어가지 않는다) (b) 같은 `.app` 폴더에서 `Enter`만 → 탭 경로가 `.app` 안으로 바뀌고 `opened`는 비어 있다(기존 동작 유지) (c) 이름이 대소문자만 다른 `Foo.APP`도 (a)처럼 실행된다 (d) 일반 폴더에서 `Shift+Enter` → `Enter`처럼 안으로 들어가고 `opened`는 비어 있다 (e) 일반 파일에서 `Shift+Enter` → `Enter`처럼 `opened`에 들어간다 (f) 원격(`sftp://`) 경로의 `.app` 폴더에서 `Shift+Enter` → `openPath`를 부르지 않는다(`opened` 비어 있음).
  2. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 가드: 지금도 통과한다).
  3. 저장소 루트에서 `bun run test` 종료 코드 0, desktop 통과 수가 1461 이상 (회귀 가드: 지금 1461 통과·1 skipped — `packages/actions`의 키 충돌·액션 목록 시험, i18n 짝 검사, 기존 `Enter` 시험이 그대로 통과해야 한다).
  4. `grep -c "core.open.launch" docs/05-actions-keybindings.md` ≥ 1 그리고 `grep -c "core.open.launch" packages/actions/src/defaults.ts` ≥ 2 (메타데이터 + `pane` 스코프 바인딩; 지금은 둘 다 0).
  5. `git diff --name-only cae58c0 -- crates apps/desktop/src-tauri packages/ts-client/src` 출력이 비어 있다 (회귀 가드: Rust·`ts-client`를 건드리지 않는다. 지금도 비어 있다).

## Work slices
- [ ] S1. `packages/actions/src/defaults.ts`에 액션 `core.open.launch`(title "앱 실행 (.app 열기)", category Navigation, scope `pane`, `isApplicable: hasCursorItem`)와 바인딩 `b("pane", "core.open.launch", "Shift+Return")`을 더하고, `actions.ts`에 핸들러를 잇고, `i18n/ko.ts`·`en.ts`에 `action.core.open.launch`를 더한다. `pane` 스코프의 다른 바인딩과 키가 겹치지 않는다 — completion criterion: `packages/actions` 시험과 i18n 짝 검사가 통과하고 DoD 4의 `defaults.ts` 줄이 충족된다
- [ ] S2. `store.ts`에 `openLaunch()` 추가: 커서 항목이 로컬(원격·압축 안 아님)·폴더·이름이 `.app`(대소문자 무시, 끝 구분자 무시)이면 `backend.openPath(path)`(실패는 `fail`)로 앱을 실행하고, 그 밖에는 `api.open()`과 똑같이 한다 — completion criterion: DoD 1의 (a)(c)(d)(e)(f)
  (depends: S1)
- [ ] S3. `apps/desktop/src/__tests__/app-bundle-launch.test.tsx`에 DoD 1의 여섯 시험을 쓴다. (b)는 현재 동작을 고정하는 회귀 시험이다 — completion criterion: DoD 1
  (depends: S2)
- [ ] S4. `docs/05-actions-keybindings.md`의 `core.open` 근처에 `core.open.launch` 행(키 `Shift+Enter`, scope pane, 자체 ID)을 더하고 `Enter`는 `.app` 안으로 들어간다는 점과 이 액션이 실행한다는 점을 한 줄 적는다 — completion criterion: DoD 4의 docs 줄
