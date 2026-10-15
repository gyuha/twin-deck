<!-- forge-slug: remove-view-mode -->
<!-- task: 164 -->
<!-- tdd: off -->
# 표시 모드(한 줄 표 / 열 1·2·3개 보기) 기능 전체 제거 (이슈 #74)

## 목표 / 하지 않을 것
- 목표: `Mod+Alt+0~3`으로 바꾸던 표시 모드를 코드·키·도움말·문서에서 모두 없앤다. 열 1~3개 보기에서 `→`로 미리보기가 안 되던 문제는 그 모드가 사라져 해소된다. 목록은 항상 표(table)이다.
- 하지 않을 것: 정렬 키(`core.view.order`)와 표 컬럼 설정(`view.table.columns`) 변경, Rust `ViewSnap`·`td-state` 스키마 변경(이전 상태 파일 호환을 위해 그대로 두고 UI에서 표로 정규화), `gen-types` 재생성, `CHANGELOG.md`·버전·배포.

## 기준 문서
- 용어집: 없음 / 관련 ADR: 없음
- 완료 정의(DoD): `loop.md`의 C1~C4와 같다.
  1. C1: `bash /tmp/c1.sh | wc -l` → 0. 작업 전 41(앞방향 검사).
  2. C2: `cd apps/desktop && bunx vitest run src/__tests__/no-view-mode.test.tsx` 통과. 작업 전 파일 없음(앞방향 검사).
  3. C3: `tsc --noEmit` 0, 전체 vitest 통과, `cargo test -p td-state -p td-config` 통과. 작업 전에도 통과(회귀 방어선).
  4. C4: `bash /tmp/c4.sh | wc -l` → 0. 작업 전 21(앞방향 검사).

## 작업 쪼개기
- [ ] S1. 상태·렌더링·액션에서 표시 모드를 걷어낸다: `store.ts`(`ViewMode`·`setViewMode`·`moveColumn`·`goLeft/goRight`의 다음 컬럼 분기·`multiColumn` 맥락·복원·저장 시 표로 정규화), `FileTable.tsx`(다열 레이아웃), `ActionBar.tsx`, `actions.ts`, `packages/actions/src/defaults.ts`(액션·바인딩·`multiColumn`), i18n(`action.core.view.mode`, `store.mode.unknown`). — 완료 기준: tsc 0, C1의 코드 부분 0줄.
- [ ] S2. 다열 모드를 시험용 데이터로 쓰던 테스트를 표 기준으로 바꾸고(지우지 않는다), `tab-goto.test.tsx`의 "표시 모드와 키가 겹치지 않는다"를 "`Ctrl+Alt+1`은 아무 일도 하지 않는다"로 바꾸며, `no-view-mode.test.tsx`를 쓴다. — 완료 기준: C2 통과, 전체 vitest 통과 (depends: S1)
- [ ] S3. 문서·도움말을 맞춘다: `docs/00`·`01`(CFG-07, PANE-02)·`05`·`07`(4.1절)·`docs/README.md`와 README 한 쌍의 `Ctrl+Alt+1~3은 표시 모드` 문장. — 완료 기준: C1·C4 0줄 (depends: S1)
