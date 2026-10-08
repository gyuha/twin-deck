<!-- forge-slug: finder-file-drop-to-pane -->
<!-- task: 113 -->
<!-- tdd: off -->
# Finder에서 끌어온 파일을 패널에 놓으면 그 폴더로 복사한다

## 목표 / 하지 않을 것
- 목표: Finder(운영체제 파일 관리자)에서 끌어 온 파일을 Twin Deck 패널에 놓으면 그 폴더로 **복사**한다. (GitHub 이슈 #39)
  - 원인(코드로 확인, [중간]): Tauri 창은 `dragDropEnabled`가 기본값이라 OS 드롭이 웹 화면의 HTML 드롭이 아니라 Tauri 이벤트(`enter`/`over`/`drop`/`leave`, 물리 좌표, 경로 목록)로만 전달되는데 앱에 수신기가 없다.
  - 대상 결정은 앱 안 끌어 놓기(`dropTargetAt`)와 같다: 커서 아래가 폴더 행이면 그 폴더 안으로, 아니면 그 패널의 현재 폴더. 가상 탭(검색 결과 등)에는 놓을 수 없고 알림을 보인다. 패널 밖(상태 표시줄 등)에 놓으면 아무 일도 없다.
  - **항상 복사**한다(수정키 정보가 Tauri 드롭 이벤트에 없다). 기존 `dropTransfer`를 그대로 써서 이름 충돌은 기존 충돌 창을 거치고 작업 큐·진행 창에 들어간다. 끌어 온 항목이 모두 이미 대상 폴더 안에 있으면 건너뛴다(알림).
  - 끌고 있는 동안(`over`) 대상 패널·폴더 행을 앱 안 끌기와 같은 방식으로 강조하고(`data-drop-target`), `leave`·`drop`에서 해제한다. OS가 자기 끌기 그림을 그리므로 앱의 따라다니는 표시(ghost)는 그리지 않는다.
- 구현 방향: `Backend`에 `onFileDrop(handler)`(이벤트 `{ type, paths, x, y }`, 좌표는 CSS px)를 더한다. `TauriBackend`는 `getCurrentWebview().onDragDropEvent`로 받아 물리 좌표를 `devicePixelRatio`로 나눠 올린다. `FakeBackend`는 `emitFileDrop`을 가진다. 스토어는 `externalDrop(event, element)`에서 `document.elementFromPoint`로 얻은 요소로 대상을 정한다.
- 하지 않을 것: 이동·삭제(복사만) · 수정키로 이동 선택 · 아카이브 안 패널에 놓기 · 드롭 대화상자(복사/이동 선택) · `crates`(Rust 로직)·바인딩 변경 · 탭 줄이나 사이드바에 놓기

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음 (새 용어를 만들지 않았다)
- 관련 ADR: 없음
- 관련 이슈: GitHub 이슈 #39
- 갱신할 문서: `docs/07-ui-spec.md`(드래그 앤 드롭 설명에 OS에서 놓기 추가)
- 완료 정의(DoD) = `.forge/loop.md`의 C1~C4:
  1. `cd apps/desktop && bunx vitest run src/__tests__/external-drop.test.tsx` 통과, 6건 이상 (사전 상태: 파일이 없어 실패 — 앞으로 가는 확인)
  2. `cd packages/ts-client && bunx vitest run` 통과, `TauriBackend` 드롭 수신기 변환 테스트 포함 (사전 상태: 변환 테스트 없음 — 앞으로 가는 확인. 기존 50건은 통과)
  3. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 의 실패가 기준선 4건뿐이다 (사전 상태: 같은 4건 — 회귀 방지)
  4. `git diff --stat -- crates` 가 비어 있다 (사전 상태: 비어 있음 — 회귀 방지)
  5. 실제 앱 확인(자동 테스트가 못 보는 부분): Finder에서 파일을 끌어 Twin Deck 패널에 놓으면 복사되는지, 폴더 위에 놓으면 그 안으로 들어가는지, 끄는 동안 강조가 보이는지 사람이 본다. 실제 OS 끌기 입력과 Tauri 이벤트 좌표는 기계로 만들 수 없다.

## 작업 조각
- [ ] S1. 백엔드 경로 — `FileDropEvent` 타입, `Backend.onFileDrop`, `TauriBackend`(Tauri 이벤트 → `FileDropEvent`, 물리 좌표 ÷ `devicePixelRatio`), `FakeBackend.emitFileDrop`, `index.ts` 내보내기, ts-client 테스트. — 완료 기준: DoD 2
- [ ] S2. 스토어 — `externalDrop`(enter/over → 대상 계산과 강조 상태, leave → 해제, drop → 복사 또는 알림), `DragState`에 외부 끌기 표시, 이벤트 구독을 스토어의 구독 설정(`resubscribe`)에 연결. (depends: S1) — 완료 기준: S4의 해당 테스트
- [ ] S3. UI — 외부 끌기일 때 `DragLayer`의 따라다니는 표시를 그리지 않고, 대상 패널·폴더 행 강조가 기존과 같이 나오게 한다. (depends: S2) — 완료 기준: 강조 테스트
- [ ] S4. 테스트 — `external-drop.test.tsx` 6건 이상(C1 항목 전부). (depends: S2) — 완료 기준: DoD 1
- [ ] S5. 문서 — `docs/07-ui-spec.md`. (depends: S2) — 완료 기준: `grep -c "Finder에서 끌어" docs/07-ui-spec.md` 가 1 이상
