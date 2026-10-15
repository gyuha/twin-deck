<!-- forge-slug: tab-goto-shortcuts -->
<!-- task: 163 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 탭 번호로 이동하는 단축키 (이슈 #73)

## 목표 / 하지 않을 것
- 목표: 현재 패널의 탭을 번호로 바로 옮긴다. macOS는 `Cmd+1~9`, Windows/Linux는 `Ctrl+Shift+1~9`이다. `1~8`은 해당 번째 탭, `9`는 마지막 탭이고, 탭 수를 넘는 번호는 아무 일도 하지 않는다. 터미널 탭이 활성일 때도 앱이 받는다. 새 액션은 `core.tab.goto`(인수 `index`)이다.
- 하지 않을 것:
  - 표시 모드 키(`Mod+Alt+0~3`)와 기존 탭 키는 바꾸지 않는다. Windows/Linux에서 `Ctrl+Alt+숫자`가 표시 모드와 같은 조합이라 이슈의 매핑 대신 `Ctrl+Shift+숫자`로 정했다(사용자 결정).
  - 설정 키를 만들지 않는다. 사용자는 기존 키 재지정으로 바꿀 수 있다.
  - `CHANGELOG.md`·버전 올리기·배포는 하지 않는다.

## 기준 문서
- 용어집: 없음
- 관련 ADR: 없음
- 정의 `docs/05-actions-keybindings.md`가 액션·기본 키 목록이다. 액션이나 기본 키를 바꾸면 이 문서와 `fkey-bindings.test.tsx`(F키만 열거)를 확인한다.
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/tab-goto.test.tsx` 통과. 작성 시점: 파일이 없어 실패한다(앞방향 검사).
  2. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0이고 `bunx vitest run` 전체 통과. 작성 시점에도 통과한다(회귀 방어선).
  3. `grep -l 'core.tab.goto' docs/05-actions-keybindings.md`가 그 파일을 출력한다. 작성 시점: 출력 없음(앞방향 검사). `grep -c "Ctrl+Shift+1" README.md README.en.md`가 둘 다 ≥ 1. 작성 시점 값은 실행해서 기록한다.

## 작업 쪼개기
- [ ] S1. `packages/actions/src/defaults.ts`에 `core.tab.goto` 액션(범주 Tab, 스코프 pane·terminal, `tabCount > 1`일 때만 적용)을 정의하고 `index` 1~9마다 바인딩을 추가한다(공통 `Mod+N`이 아니라 플랫폼별: mac은 `Mod+N`, other는 `Ctrl+Shift+N`; pane·terminal 스코프). `apps/desktop/src/actions.ts`에 핸들러를, `state/store.ts`에 `gotoTab(index)`(`1~8` 해당 탭, `9` 마지막, 범위 밖은 변화 없음)를 추가한다. — 완료 기준: DoD 1의 해당 단언들이 통과한다.
- [ ] S2. `apps/desktop/src/__tests__/tab-goto.test.tsx`를 쓴다. mac `Cmd+2`/`Cmd+9`/범위 밖, Windows `Ctrl+Shift+2`, Windows `Ctrl+Alt+1`이 표시 모드를 유지하고 탭을 바꾸지 않음, 터미널 탭 활성 상태 동작을 단언한다. — 완료 기준: DoD 1 (depends: S1)
- [ ] S3. 문서를 맞춘다: `docs/05-actions-keybindings.md`에 `core.tab.goto` 행과 기본 키, `README.md`·`README.en.md`의 키 표에 새 키(같은 커밋). — 완료 기준: DoD 3 (depends: S1)
