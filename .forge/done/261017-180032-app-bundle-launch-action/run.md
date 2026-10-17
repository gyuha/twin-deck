# RUN — `.app` 번들을 실행하는 액션을 더한다 — `Shift+Enter` (이슈 #90)

워크플로 없이 직접 실행했다(변경이 작다).

## 슬라이스 결과
- S1 액션 `core.open.launch` + 바인딩 `Shift+Return`(pane) + 핸들러 + i18n ko/en — ✅ as planned (키 충돌·i18n 짝 시험 통과)
- S2 `store.ts`의 `openLaunch()` — ✅ as planned (로컬 `.app` 폴더만 `openPath`, 나머지는 `open()`과 동일)
- S3 `app-bundle-launch.test.tsx` 6개 — ✅ as planned (구현을 `open()`만 부르게 무력화하면 (a)(c)가 실패함을 확인한 뒤 원복)
- S4 `docs/05-actions-keybindings.md` 행 — ✅ as planned

## DoD baseline → after
1. `app-bundle-launch.test.tsx` — 파일 없음(실패) → 6개 통과
2. `tsc --noEmit` — 통과 → 통과 (회귀 가드)
3. `bun run test` — desktop 1461 통과 → 1467 통과 (회귀 가드)
4. `core.open.launch` docs/05 0 → 1, defaults.ts 0 → 2
5. Rust·`ts-client` diff — 0 → 0 (회귀 가드)

## 기록
- 한계: `FakeBackend`의 `opened` 기록으로만 검증했다. 실제 macOS에서 `open Foo.app`으로 앱이 뜨는지는 보지 못했다(Rust `open_file`·`open_command`는 폴더 경로를 그대로 `open`에 넘기는 기존 코드다).
- 스토어는 OS를 모르므로 이름이 `.app`인 로컬 폴더면 OS와 무관하게 `openPath`를 부른다. Windows·Linux의 `x.app` 폴더에서는 OS 파일 관리자가 열릴 수 있다(드문 경우).
- 우클릭 메뉴에는 항목을 더하지 않았다(Non-goal). 마우스만 쓰는 사용자는 아직 실행 방법이 없다.
