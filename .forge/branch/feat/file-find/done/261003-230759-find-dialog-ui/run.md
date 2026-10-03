# RUN — 파일 찾기 다이얼로그(기본 탭)와 Cmd/Ctrl+F (find-dialog-ui)

실행 방식: 메인 세션에서 직접 실행(Dynamic Workflow 없음, `running.md` 없음).

## 슬라이스별 결과
- S1 키·액션·스코프 — ✅ 계획대로. `core.find.open`(Mod+F), `core.find.close`(Esc, `find` 스코프), `Scope`에 `find` 추가(모달 스코프 목록 포함), Quick Select는 `Mod+Shift+F`로 이동. 기존 테스트 중 Quick Select를 Mod+F로 시작하던 곳은 `config.test.tsx` 한 곳뿐이라 그것만 새 키로 고쳤다(이유: 의도된 키 이동). docs/05 갱신
- S2 스토어 — ✅ 계획대로. `find`/`lastFind` 상태, `openFind`/`closeFind`/`setFindForm`/`findReset`/`findRestoreLast`/`findStart`/`cancelFinds`. 시작할 때 오류(빈 텍스트, 선택 없음, 잘못된 정규식)는 다이얼로그 안 `role="alert"`로 보여 주고 닫지 않는다. 잘못된 정규식은 백엔드가 거부한 메시지를 `openVirtual`의 실패 알림 대신 다이얼로그로 옮겨 보여 준다
- S3 `FindDialog.tsx` — ✅ 계획대로(이미지의 기본 탭 구성). 비활성 항목에는 `title="아직 지원하지 않습니다"`. Enter는 `<form onSubmit>`으로 시작한다(전역 Return 바인딩을 두지 않아 포커스된 버튼의 Enter와 충돌하지 않는다). 폴더 찾아보기 버튼은 비목표라 넣지 않았다
- S4 전체 회귀·품질 확인 — ✅ 계획대로

## DoD baseline → after
1. `file-find.test.tsx`: 없음 → F1~F15 15개 모두 통과(전진). 결과는 `FakeBackend.startFind`로 구동하고 새 탭의 항목 이름 전체 목록을 단언한다.
2. 열려있는 탭(F13)은 `searchesStarted`에 기록된 명세의 `roots`가 `["/home/a", "/home/b"]`인 것까지 확인.
3. 기존 테스트: `config.test.tsx`의 Quick Select 키만 변경(`Mod+F` → `Mod+Shift+F`). 그 밖의 기대값은 그대로. 전체 vitest 485 passed, 실패는 기존 pdf-preview 1건.
4. docs/05: `core.find.open` 행 0 → 1. **DoD와 실제 문서가 달랐다:** 계획은 "`core.quickselect.start` 행의 키가 `Mod+F`에서 `Mod+Shift+F`로 바뀐다"고 썼지만 문서에는 그 행이 원래 없어서, 새 키와 이유를 적은 행을 추가했다(0 → 1).
5. 전체 완료 조건: C1 typecheck 0 · C2 cargo test --workspace 0, vitest 비-pdf 실패 0 · C3 15개 이름 각각 ✓ · C4 find_* 9종과 start_find_streams_matches ok · C5 fmt 0, clippy 0, up_to_date 0.
6. 실제 앱 UAT(실제 폴더에서 Cmd+F로 열어 찾아 보기, 이미지와 모양 비교)는 자동 검사 범위 밖이라 사람이 확인한다 — 검증 한계로 명시.

## 발견한 것
- `user.type`은 `[`와 `{`를 키 이름으로 해석해서 정규식 입력 테스트가 처음에 실패했다. `paste`를 쓴다.
- 파일 찾기 진행 중에 다이얼로그를 다시 열면 취소 버튼이 활성이 되도록 `running && kind === "find"`인 탭이 하나라도 있는지를 본다(취소는 모든 진행 중인 파일 찾기를 멈춘다).
- 마지막 검색은 메모리에만 있다. 앱을 다시 켜면 사라진다(비목표).
- 입력 필드의 접근성 이름은 이미지의 레이블 그대로("파일 마스크(F)", "디렉터리에서 시작(D)" 등)이고, 단축키 밑줄(D, X, B, F, E, G)은 표시만 있고 실제 단축키 동작은 없다.
