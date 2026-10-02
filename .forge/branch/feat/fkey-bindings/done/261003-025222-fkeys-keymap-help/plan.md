<!-- forge-slug: fkeys-keymap-help -->
<!-- task: 30 -->
<!-- part: 2/3 -->
<!-- tdd: off -->
# F키 설정을 키맵에 반영하고 앱 실행·도움말 액션 추가

## 목표 / 비목표
- 목표:
  - `config.fkeys`를 사용자 바인딩으로 바꿔 키맵에 병합한다. 병합 순서는 **F키 설정 → `keybindings.toml`** 이라 파일이 이긴다. `""`은 건너뛰고, `"none"`은 그 키 해제(`action: null`), `core.app.launch`는 `args: { app: <fkey_apps.Fn> }`, 그 밖의 값은 그 액션 ID 그대로.
  - 새 액션 `core.app.launch`(인수 `app`): 활성 패널의 **선택 항목 전체 → 없으면 커서 항목 하나 → 항목이 하나도 없으면(빈 폴더) 현재 폴더** 경로를 `backend.launchApp(app, paths)`로 넘긴다. `app`이 비었으면 실행하지 않고 안내 메시지(`F3에 지정된 애플리케이션이 없습니다` 형식)를 띄운다. 가상 탭(검색 결과)에서는 선택/커서 항목의 경로를 그대로 쓴다.
  - 새 액션 `core.help`: 현재 키 바인딩 전체(액션 이름 · 키)를 보여 주는 도움말 화면을 연다. 기본 키 `F1`. Esc로 닫는다(스코프 `help` 신설, `scopeStack`에 반영). 데이터는 Actions Panel이 쓰는 액션 카탈로그(`attachPalette`)에서 가져온다.
- 비목표: 설정 화면 UI(다음 작업), 도움말 화면의 검색·편집, 키 충돌 경고 UI.

## 기준 문서
- 용어집: 없음 · 관련 ADR: 없음
- 완료 정의(DoD): `.forge/branch/feat/fkey-bindings/loop.md`의 C3 중 T1~T8, T11, T12 + 회귀 없음.
  1. `apps/desktop/src/__tests__/fkey-bindings.test.tsx`(신규, 이 작업이 만든다)에 아래 테스트가 **정확히 이 이름으로** 있고 통과: T1 "fkeys.F2에 core.rename을 지정하면 F2가 이름 바꾸기를 연다" · T2 "기본 F5를 다른 액션으로 바꾸면 복사가 실행되지 않는다" · T3 "none으로 지정하면 기본 키가 해제된다" · T4 "F1은 단축키 목록 화면을 열고 Esc로 닫는다" · T5 "앱 실행 F키는 선택 항목을 인자로 넘긴다" · T6 "선택이 없으면 커서 항목을 넘긴다" · T7 "빈 폴더면 현재 폴더를 넘긴다" · T8 "앱이 지정되지 않은 F키는 실행하지 않고 알린다" · T11 "keybindings.toml이 F키 설정보다 우선한다" · T12 "설정이 비어 있으면 기존 F키 기본 바인딩이 그대로다"(기본 F4·F5·F6·F7·F8·F12와 Shift+F4/F6/F7/F8이 변경 전과 같은 액션을 가리키고 F1만 `core.help`로 추가됐음을 단언). (사전: 파일 없음 → 전진 확인)
  2. T5~T7은 `FakeBackend.launched`의 `{app, paths}`를 단언한다. T5는 2개 이상 선택하고 둘 다 전달됨을 보인다.
  3. `bun run typecheck` 0, `bunx vitest run` 실패는 pdf-preview 1건뿐(기존 키보드 시나리오·액션 목록 길이를 세는 기존 테스트가 있으면 의도된 변경에 한해 고치고 이유를 남긴다), `cargo test --workspace` 0 (회귀 방지, 사전 통과).
  4. F1이 이미 다른 액션에 바인딩돼 있지 않다는 사전 확인: `grep -n '"F1"' packages/actions/src/defaults.ts` 결과 없음(사전 0).

## 작업 조각
- [ ] S1. `core.app.launch` 액션·핸들러·`api.launchApp` — 완료 기준: DoD 1의 T5~T8.
- [ ] S2. `config.fkeys` → 사용자 바인딩 병합(순서 규칙 포함) — 완료 기준: DoD 1의 T1~T3, T11. (depends: S1)
- [ ] S3. `core.help` 액션·`help` 스코프·도움말 화면·기본 키 F1 — 완료 기준: DoD 1의 T4, T12. (depends: S2)
- [ ] S4. 전체 회귀 확인 — 완료 기준: DoD 3. (depends: S3)
