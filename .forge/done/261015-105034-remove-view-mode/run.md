# run — 표시 모드(한 줄 표 / 열 1·2·3개 보기) 기능 전체 제거 (이슈 #74)

워크플로 없이 이 세션에서 직접 실행했다.

## 슬라이스별 결과
- S1 상태·렌더링·액션 — ✅ 계획대로. `TabState.view`와 `ViewMode` 타입, `setViewMode`, `moveColumn`, `goLeft/goRight`의 다음 컬럼 분기, `multiColumn` 맥락, `FileTable`의 다열 렌더링·`data-view`, 액션 `core.view.mode`와 `Mod+Alt+0~3`, i18n(`action.core.view.mode`, `store.mode.unknown`)을 지웠다. `core.move.left/right`의 제목에서 "이전/다음 컬럼"도 뺐다. 상태 저장은 `view: { mode: "table", count: 1 }`을 그대로 쓰고 복원은 저장된 `view`를 무시한다(Rust `ViewSnap` 변경 없음).
- S2 테스트 — ✅. 다열 모드 자체를 시험하던 테스트만 지웠다(`columns-sort`의 모드 전환·컬럼 이동 3개, `file-icons`의 멀티 컬럼 아이콘 1개, `date-groups-ui`의 여러 열 보기 1개, `virtual-list`의 3열 부분). 나머지는 표 기준으로 바꿨다. 새 `no-view-mode.test.tsx` 7개.
- S3 문서 — ✅ `docs/00`·`01`(PANE-02, NAV-05, CFG-07은 취소선+제거됨)·`05`·`07`(4.1절)·`docs/README.md`, README 한 쌍의 `Ctrl+Alt+1~3` 문장.

## DoD baseline → after
1. C1(`/tmp/c1.sh` 줄 수): 41 → 0. 처음 쓴 `columns-[123]` 검색은 `Help.tsx`의 Tailwind CSS 클래스(`columns-1`, 도움말 레이아웃)를 잡는 오탐이라 따옴표로 끝나는 문자열만 찾게 좁혔다.
2. C2 `no-view-mode.test.tsx`: 파일 없음 → 7 통과.
3. C3: tsc 0 → 0, `bun run typecheck` 통과, vitest 전체 1354 → 1356(163파일) 통과(이번에는 한 번에 통과; load average 51), `cargo test -p td-state -p td-config` 통과(Rust 변경 없음), `packages/actions` 19·`keybinds` 15 통과.
4. C4(`/tmp/c4.sh` 줄 수): 21 → 0. 이력 설명 문구는 "다열 보기"로 풀어 썼다.

## 계획과의 차이·한계
- 실제 앱(WKWebView)에서는 확인하지 못했다. 단위 테스트(jsdom)로만 검증했다.
- 이전 상태 파일(`view: columns`)은 jsdom 테스트로 표로 열림을 확인했고 실제 파일로는 확인하지 못했다.
- `docs/m1-status.md`·`docs/m2-*.md`의 과거 기록은 손대지 않았다.
