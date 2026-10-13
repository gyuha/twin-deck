<!-- forge-slug: shift-select-keys -->
<!-- task: 149 -->
<!-- tdd: off -->
# Shift+PageUp/PageDown/Home/End 범위 선택과 macOS Cmd+↑/↓ (이슈 #51)

## 목표 / 하지 않을 것
- 목표: 파일 목록에서 Shift+PageUp/PageDown으로 한 페이지(`PAGE_SIZE`=10행), Shift+Home/End로 목록 처음/끝까지 범위 선택(기존 Shift+↑/↓와 같은 "지나간 범위의 선택 반전" 방식)이 된다. macOS에는 Home/End 키가 없으므로 `Cmd+↑/↓`가 Home/End(커서 이동)이고 `Cmd+Shift+↑/↓`가 Shift+Home/End(범위 선택)와 같다.
- 하지 않을 것:
  - 선택 방식을 바꾸지 않는다(`selection.shift_mode`의 `extend` 같은 설정은 다루지 않는다).
  - Windows/Linux의 `Ctrl+↑/↓`는 건드리지 않는다. Cmd+↑/↓ 바인딩은 macOS 전용 목록에만 둔다.
  - Rust·설정·번역 파일은 건드리지 않는다. 지금 막혀 있는 곳은 `useKeyboard.ts`의 Shift+이동 처리(Shift+↑/↓만 있음)와 기본 키(`defaults.ts`)뿐이다.

## 근거 자료
- 용어: 없음(`.forge/CONTEXT.md`에 선택 용어 없음). 선택 규칙은 `docs/05-actions-keybindings.md` 151행(Shift+이동 = pane 스코프 입력 규칙)과 SEL-02에 있다.
- 관련 ADR: 없음.
- 코드로 확인한 사실: `apps/desktop/src/ui/useKeyboard.ts:32`가 Shift+ArrowUp/ArrowDown만 `api.shiftMove`로 보낸다(`pane`·`quickSelect` 스코프). `store.ts`의 `shiftMove(delta)`는 `clamp`로 끝에 맞춘다. `core.move.home`/`end`/`page_up`/`page_down`은 Home/End/PageUp/PageDown에 묶여 있다. `Mod+Up`/`Mod+Down` 바인딩은 어디에도 없다. `defaults.ts`의 `DEFAULT_BINDINGS_BY_PLATFORM.mac` 목록이 macOS 전용 키 자리다.
- 완료 정의(DoD): 아래 "검증"의 명령이 모두 통과한다.

## 작업 조각
- [ ] S1. Shift+PageUp/PageDown/Home/End 범위 선택 — 완료 기준: 시드된 12개 항목 목록에서 커서가 첫 항목일 때 Shift+PageDown → 커서가 10번째 항목(index 10)이 되고 지나간 항목 0~9(도착 항목 제외)가 선택된다. 반대로 Shift+PageUp, Shift+End(마지막 항목으로, 도착 항목 제외 나머지 선택), Shift+Home도 같은 반전 규칙대로 동작한다. 이미 선택된 항목은 반전되어 해제된다(기존 Shift+↑/↓와 같은 규칙).
- [ ] S2. macOS `Cmd+↑/↓`와 `Cmd+Shift+↑/↓` — 완료 기준: macOS 기본 키에서 `Mod+Up`이 `core.move.home`, `Mod+Down`이 `core.move.end`로 묶이고(`defaultBindingsFor("mac")`에는 있고 `"windows"`·`"linux"`에는 없다), 키보드 입력 처리가 macOS에서 `Cmd+Shift+↑/↓`를 S1의 Shift+Home/End와 같게 범위 선택으로 보낸다.
- [ ] S3. 키 카탈로그 갱신 — 완료 기준: `docs/05-actions-keybindings.md`에 위 키들(Shift+PageUp/PageDown/Home/End, macOS Cmd+↑/↓, Cmd+Shift+↑/↓)이 적힌다. 기본 키가 바뀌었으므로 프로젝트 규칙상 필수다.
- [ ] S4. 테스트 — 완료 기준: `apps/desktop/src/__tests__/shift-select-keys.test.tsx`(새 파일)가 S1·S2의 동작을 키 입력으로 검사한다(최소 6개 케이스: Shift+PageDown, Shift+PageUp, Shift+End, Shift+Home, 선택 반전, macOS 키 매핑). macOS 플랫폼을 테스트에서 흉내 내기 어려우면 매핑은 `packages/actions`의 기본 키 테스트에서 `defaultBindingsFor("mac")`로 확인한다.

## 검증 (작성 시점의 상태)
- 아래는 모두 앞으로 맞춰야 하는 확인이라 지금은 통과하지 않는 것이 정상이다. 새 테스트 파일이 아직 없다.
- `cd apps/desktop && bunx vitest run src/__tests__/shift-select-keys.test.tsx --reporter=json` → `numFailedTests` 0, `numPassedTests` ≥ 6.
- `bun run test` → 전체 통과(기존 테스트 회귀 확인. 작성 시점에 `bun run test` 전체는 아직 돌려 보지 않았다).
- `bun run typecheck` → 오류 없음.
- `grep -c "Shift+PageDown\|Shift+Home\|Cmd+Shift" docs/05-actions-keybindings.md` → ≥ 1(지금은 0). 이 확인은 문서에 글자가 있다는 것만 보여 주므로 위 동작 테스트를 대신하지 못한다.
- 실제 macOS WKWebView에서 키가 앱까지 오는지(Tauri 메뉴 단축키가 `Cmd+↑/↓`를 먼저 가져가는지)는 자동 검사로 확인할 수 없다. 첫 사용자 확인 대상으로 run.md에 한계를 적는다.
