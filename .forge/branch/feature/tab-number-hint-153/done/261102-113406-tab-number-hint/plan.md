<!-- forge-slug: tab-number-hint -->
<!-- repaired-by: fg-loop -->
<!-- task: 209 -->
<!-- tdd: off -->
# 수식키를 누르고 있으면 활성 패널 탭에 번호 배지 표시 (이슈 #153)

## 목표 / 하지 않을 것
- 목표: mac에서 Cmd, Windows·Linux에서 Ctrl+Shift를 0.4초 누르고 있으면 활성 패널의 탭 이름 앞에 네모 안 숫자 배지를 보여, `Mod+N`/`Ctrl+Shift+N`(`core.tab.goto`)으로 갈 탭을 바로 알 수 있게 한다. 1~8번째 탭은 그 번호, 마지막 탭은 9.
- 하지 않을 것: 키 바인딩 기본값 변경, 설정 키 추가, 사용자가 바꾼 바인딩을 따라 수식키를 바꾸는 일(플랫폼별 고정), 비활성 패널 표시.

## 근거
- 용어: 없음
- 관련 ADR: 없음
- 바인딩: `packages/actions/src/defaults.ts` `DEFAULT_BINDINGS_BY_PLATFORM`(mac `Mod+1~9`, other `Ctrl+Shift+1~9`), 동작: `store.ts` `gotoTab`(9 = 마지막 탭), 탭 UI: `apps/desktop/src/ui/TabBar.tsx`
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/tab-number-hint.test.tsx` 통과 — loop.md C1의 (a)~(g)를 각각 단언
  2. `cd apps/desktop && bunx vitest run` 전체 통과
  3. `cd apps/desktop && bunx tsc --noEmit` 통과
  4. `grep -n "core.tab.goto" docs/05-actions-keybindings.md` 줄에 배지 설명

## 작업 조각
- [ ] S1. 수식키 길게 누름 감지(타이머 0.4초, 다른 키·keyup·blur에 해제, 플랫폼별 수식키)와 TabBar 배지 표시(활성 패널, 탭 2개 이상, 1~8 + 마지막=9) — 완료 기준: DoD 1~3 통과
- [ ] S2. docs/05 `core.tab.goto` 줄에 배지 설명 추가 — 완료 기준: DoD 4 (depends: S1)
