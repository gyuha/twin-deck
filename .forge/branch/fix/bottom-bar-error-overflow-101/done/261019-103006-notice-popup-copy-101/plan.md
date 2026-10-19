<!-- forge-slug: notice-popup-copy-101 -->
<!-- task: 201 -->
<!-- tdd: on -->
# 하단 오류 메시지 레이아웃 고정과 클릭 시 복사 팝업 (이슈 #101)

## Goal / Non-goals
- Goal: 상태 바(`App.tsx`의 `StatusBar`)에 긴 `notice`가 떠도 오른쪽 버튼 묶음이 깨지지 않게 하고, 메시지를 누르면 미리보기 같은 창에 전체 문구를 보여 주며 거기서 클립보드로 복사할 수 있게 한다.
- Non-goals: 오류 문구 자체 변경, `flash`·경고 버튼 동작 변경, Rust/ts-client 변경, 새 액션·단축키, 릴리스.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `bunx vitest run src/__tests__/status-notice.test.tsx` 통과, 테스트 ≥3 (레이아웃 클래스·클릭 시 팝업·복사). 구현 전에는 실패(red)해야 한다 → 통과(green).
  2. `bunx vitest run` 전체 통과, `bunx tsc --noEmit` 오류 0.
  3. 실제 WKWebView에서의 레이아웃은 시험이 덮지 못한다(jsdom은 배치를 계산하지 않음) — 한계로 기록.

## Work slices
- [ ] S1. `status-notice.test.tsx`를 먼저 쓴다(긴 notice에서 버튼 묶음 `shrink-0`·메시지 `truncate min-w-0`, 메시지 클릭 → 팝업에 전체 문구, 복사 버튼 → FakeBackend 클립보드) — 완료 기준: 구현 전 실행하면 3건 모두 실패
- [ ] S2. 상태 바 notice를 잘리는 버튼으로 바꾸고 오른쪽 묶음을 `shrink-0`으로 고정, 누르면 전체 문구 팝업(미리보기 창의 텍스트 복사 버튼 모양·`data-copied` 방식을 따른다)을 열고 복사 버튼에서 `backend.copyText` 호출, i18n ko/en 문구 추가 — 완료 기준: S1 시험 통과 (depends: S1)
