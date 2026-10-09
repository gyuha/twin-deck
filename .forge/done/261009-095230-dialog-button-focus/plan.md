<!-- forge-slug: dialog-button-focus -->
<!-- task: 125 -->
<!-- tdd: off -->
# 다이얼로그를 열면 기본 버튼에 포커스, ←/→로 버튼 이동 (이슈 #41)

## 목표 / 하지 않을 것
- 목표: 모든 다이얼로그(종류 7: name·multirename·confirm·choice·conflict·info·progress)와 도움말을 점검해 이슈 요구를 일관되게 적용한다. 확인·선택·충돌·정보·진행 다이얼로그는 열릴 때 기본 버튼(확인/백그라운드)에 포커스, 입력칸이 있는 name·multirename은 입력 포커스 유지. 버튼에 포커스가 있을 때 ←/→는 버튼 사이로 포커스를 옮기고, Return은 **포커스된 버튼**을 실행(전역 확인으로 가로채지 않음), Esc는 늘 취소. 선택·충돌 창의 라디오 선택은 ↑/↓(충돌은 O/S/R/A 그대로). 도움말은 열리면 닫기 버튼 포커스.
- 하지 않을 것: loop.md의 범위 밖 항목.

## 기준 문서
- 관련 ADR·용어: 없음. 완료 정의(DoD): `.forge/loop.md`의 C1~C5.

## 작업 조각
- [ ] S1. `Dialog.tsx` 버튼 행 표식(`data-dialog-buttons`, 기본 `data-dialog-primary`)과 열릴 때 기본 버튼 포커스(진행 창은 버튼이 바뀌어도 다시), `Help.tsx` 닫기 버튼 포커스 — 완료 기준: C1·C4
- [ ] S2. `useKeyboard.ts`: 다이얼로그 버튼 포커스 시 ←/→ 포커스 이동, Return은 버튼에 맡김, 선택·충돌 창의 ←/→ 선택 제거 — 완료 기준: C2·C3 (depends: S1)
- [ ] S3. `dialog-focus.test.tsx`(종류 전부 나열)와 문서, 회귀 — 완료 기준: C1~C5 (depends: S2)
