# 실행 기록 — Finder에서 끌어온 파일을 패널에 놓으면 복사 (이슈 #39)

fg-loop 드라이브 중 한 세션에서 직접 처리했다(`tdd: off`, 기본값). 테스트는 구현과 함께 썼고, 구현을 되돌리면 새 테스트 8건 중 7건이 실패함을 확인했다(1건은 "패널 밖에 놓으면 아무 일 없음"이라 원래 통과).

## 조각별 결과
- S1 백엔드 경로 — ✅ `FileDropEvent`, `Backend.onFileDrop`, `TauriBackend`(`getCurrentWebview().onDragDropEvent` → `toFileDropEvent`, 물리 좌표 ÷ devicePixelRatio), `FakeBackend.emitFileDrop`. ts-client 테스트 5건(`filedrop.test.ts`). ⚠ 계획에 없던 보강: `onFileDrop`을 try/catch로 감쌌다(웹뷰 정보가 없는 환경에서 `getCurrentWebview()`가 던져 기존 `bootstrap.test`가 깨졌다).
- S2 스토어 — ✅ `externalDrop`(enter/over → 대상 계산·강조, leave → 해제, drop → 복사/알림), `DragState`에 `external`·`sourcePane: PaneId | null`, 구독은 `subscribe(() => backend.onFileDrop(...))`. 앱 안 끌기와의 충돌을 막으려고 `dragMove`·`dragRelease`에 외부 끌기 가드를 더했다(계획에 없던 보강). 같은 폴더 항목은 건너뛴다.
- S3 UI — ⚠ `DragLayer`는 외부 끌기에서 ghost를 그리지 않는다. 계획에는 "대상 패널 강조가 기존과 같이"라고 했지만 기존에는 폴더 행 강조만 있었다. 그래서 `Pane`에 패널 단위 강조(`data-drop-target` + `bg-accent/10`)를 새로 더했다. 앱 안 끌기에서도 같은 강조가 나온다. 이 때 `className` 조합이 바뀌어 `pane-tab-appearance` 테스트가 깨져 배열 펼침으로 고쳤다.
- S4 테스트 — ✅ `external-drop.test.tsx` 8건.
- S5 문서 — ✅ `docs/07-ui-spec.md` 드래그 앤 드롭 행.

## DoD / 정지 조건 (baseline → after)
- C1 `external-drop.test.tsx`: 파일 없음 → 8건 통과
- C2 `packages/ts-client` vitest: 50건 → 55건 통과(5건 추가)
- C3 tsc: 통과 → 통과. vitest 실패: 기준선 4건 → 같은 4건, 새 실패 0건. 통과 1007 → 1015
- C4 `git diff --stat -- crates`: 비어 있음 → 비어 있음
- 실제 앱 확인: **미실시**

## 알아 둘 것
- 실제 Finder에서 앱으로 끌어다 놓는 동작과 Tauri 이벤트 좌표(물리 → CSS px 변환)는 기계로 검사하지 못했다. 변환 로직은 `toFileDropEvent` 단위 테스트로, 나머지는 가짜 백엔드로만 보증한다.
- `src-tauri/capabilities/default.json`은 `core:default`를 쓴다. 이 권한에 이벤트 수신이 포함된다고 보지만([중간]) 실제 앱에서 확인하지 못했다. 안 되면 `core:event:allow-listen`을 명시해야 한다.
- 드롭 대상은 앱 안 끌기와 같은 `dropTargetAt`를 쓴다(폴더 행 → 그 폴더, 아니면 패널의 현재 폴더).
