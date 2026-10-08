# 실행 기록 — 설정을 활성 패널 자리에 띄우기 (이슈 #31)

워크플로우 없이 한 세션에서 직접 처리했다. TDD(`tdd: on`)로 테스트를 먼저 썼다.

## 조각별 결과
- S1 실패하는 테스트 — ✅ `settings-in-pane.test.tsx` 6건. 구현 전 5건 실패(red), 1건(탭 모양이 반대쪽 패널에 즉시 반영)은 원래 통과하는 회귀 방지다(백엔드 설정이 이미 반응형이라).
- S2 상태 — ✅ 계획대로. `settingsPane`(열 때의 활성 패널)을 `openSettings`가 기록한다. 닫을 때 따로 비우지는 않는다(`settingsOpen`이 false면 쓰이지 않는다).
- S3 화면 — ⚠ 계획과 다른 점: ① 반대쪽 패널의 누름 무시를 `Pane`의 `onMouseDown`에서 막는 것으로는 부족했다(행 클릭이 `FileTable`에서 따로 활성화한다). 그래서 `Pane` 구간에 캡처 단계 차단(`onMouseDownCapture`·`onClickCapture` 등 7개)을 걸었다. 휠 스크롤은 막지 않는다. ② `Settings`를 `Pane` 안에서 그리게 하면서 `onThemePreview`를 `App` → `PaneSplit` → `Pane` → `Settings`로 내려 보내고, 닫힐 때 미리보기를 걷는 일은 `Settings`가 언마운트될 때의 정리 함수로 옮겼다(#30 동작 유지, `theme-preview` 테스트 통과). ③ 설정 헤더 줄이 좁은 패널에서 넘치지 않게 `flex-wrap`을 더했다(계획에 없던 한 줄).
- S4 기존 테스트 정리와 문서 — ✅ 기존 설정 테스트는 고칠 것이 없었다(접근성 이름 `dialog "설정"` 유지). `docs/07-ui-spec.md` §11.1을 고쳤다.

## DoD (baseline → after)
1. `settings-in-pane.test.tsx`: 파일 없음 → 6건 통과 (5건은 구현 전 실패)
2. tsc: 통과 → 통과 (회귀 방지)
3. vitest 전체: 실패 4건(기준선과 동일: audio-preview · preview-scroll PDF · theme · theme-colors) → 같은 4건, 새 실패 0건. 통과 966 → 972
4. Rust·바인딩 diff: 비어 있음 → 비어 있음 (회귀 방지)
5. `docs/07-ui-spec.md` §11.1의 "활성 패널 자리": 0 → 1
6. 실제 앱 확인: **미실시** (사람이 확인해야 한다 — 특히 좁은 패널 폭에서의 섹션 탭 줄 스크롤과 반대쪽 패널의 휠 스크롤)

## 알아 둘 것
- 반대쪽 패널의 휠 스크롤이 실제 앱에서 되는지는 jsdom으로 확인하지 못했다(캡처 차단은 휠 이벤트를 막지 않는 설계다).
- 설정이 열린 패널이 좁아도(15%) 가로 스크롤이 생길 수 있다. 계획의 "하지 않을 것"(폭에 따른 자동 전환)에 따라 손대지 않았다.
