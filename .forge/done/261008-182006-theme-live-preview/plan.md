<!-- forge-slug: theme-live-preview -->
<!-- task: 84 -->
<!-- tdd: off -->
# 설정의 테마 목록에서 이동하는 즉시 임시 미리보기

## 목표 / 하지 않을 것
- 목표: 설정 화면의 테마 선택 상자(`Combobox`, 112개)에서 ↑↓로 이동하거나 마우스를 올리면 강조된 테마를 화면에 **임시로** 적용한다. 저장은 Enter나 클릭으로 확정할 때만 하고, Esc나 바깥 클릭으로 닫으면 원래 테마로 되돌린다. (GitHub 이슈 #30: "테마를 고를 때마다 선택 상자를 열었다 닫아야 한다")
- 구현 방향: `Combobox`에 선택 인자 `onPreview`(강조 항목이 바뀔 때 호출, 닫으면 `null`)를 더하고, `App.tsx`의 `useTheme`가 미리보기 값이 있으면 그것을 `<html>`에 적용한다. 미리보기 값은 설정값과 별개의 임시 상태이며 저장되지 않는다.
- 하지 않을 것: Rust·`td-config`·`packages/ts-client` 변경 · 이동 즉시 저장 · 테마 외 다른 `Combobox` 사용처의 동작 변경 · 설정 화면의 모양 변경(별도 창, 투명도 등은 이슈 #31) · 다국어(이슈 #32)

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음 (새 용어를 만들지 않았다)
- 관련 ADR: 없음
- 관련 이슈: GitHub 이슈 #30
- 완료 정의(DoD): `.forge/loop.md`의 C1~C4 (루프의 정지 조건과 같다)
  1. `cd apps/desktop && bunx vitest run src/__tests__/theme-preview.test.tsx` 통과, 3건 이상 (사전 상태: 파일이 없어 실패 — 앞으로 가는 확인)
  2. `cd apps/desktop && bunx tsc --noEmit` 통과 (사전 상태: 통과 — 회귀 방지)
  3. `cd apps/desktop && bunx vitest run` 의 실패가 기준선 3건뿐이다 (사전 상태: 같은 3건 — 회귀 방지)
  4. `git diff --stat -- crates apps/desktop/src-tauri packages/ts-client` 가 비어 있다 (사전 상태: 비어 있음 — 회귀 방지)
  5. 실제 앱 확인(vitest가 못 보는 부분): 설정에서 테마 목록을 ↑↓로 이동하며 색이 바뀌고, Esc로 닫으면 원래 색, Enter로 확정하면 유지되는지 사람이 본다.

## 작업 조각
- [ ] S1. `Combobox`에 `onPreview` 추가 — 강조 항목(커서)이 바뀔 때 그 값으로 호출하고, 확정(`onChange`)·Esc·바깥 클릭으로 닫을 때는 `null`로 호출한다. 처음 열었을 때 현재 값 항목에 커서가 있는 것은 미리보기가 아니다(호출하지 않는다). — 완료 기준: 단위 테스트가 이동·확정·취소 때의 호출 순서를 확인한다
- [ ] S2. 미리보기 상태 연결 — `App.tsx`의 `useTheme`가 미리보기 값이 있으면 그것을, 없으면 설정값을 적용한다. `Settings.tsx`의 테마 항목이 `onPreview`로 그 상태를 올린다. 설정 화면을 닫을 때(미리보기 중이라도) 미리보기 상태를 비운다. (depends: S1) — 완료 기준: `theme-preview.test.tsx`가 DoD 1의 세 동작(이동 시 적용, 저장 호출 0회, Esc 복귀·Enter 유지)과 설정 화면 닫기 시 복귀를 확인한다
