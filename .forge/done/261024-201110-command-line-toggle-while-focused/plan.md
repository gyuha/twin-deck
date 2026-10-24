<!-- forge-slug: command-line-toggle-while-focused -->
<!-- task: 206 -->
<!-- tdd: off -->
# 명령어 줄 입력칸에 포커스가 있을 때도 토글 키가 동작한다 (이슈 #119)

## 목표 / 비목표
- 목표: 명령어 줄 입력칸에 포커스가 있어도 `Mod+Shift+K`(그리고 `Mod+Shift+L`)가 명령어 줄 표시를 토글한다. `Mod+K`는 줄이 꺼져 있으면 켜고 포커스를 주는 지금 동작을 유지한다.
- 비목표: 입력칸에서 다른 앱 단축키(`Mod+A`·`Mod+C`·`Mod+V` 등)를 통과시키지 않는다(전체 선택·복사·붙여넣기는 입력칸이 받는다). 키 조합 변경, 설정 추가, 릴리스·배포·버전 올리기.

## 근거
- GitHub 이슈 #119(재오픈 댓글 "Mod + Shift + K로 명령어 줄이 토글 되지 않습니다"). 원인: `apps/desktop/src/ui/useKeyboard.ts`가 `[data-command-line]` 안의 모든 keydown을 키맵 해석 전에 return한다(이슈 #110에서 추가).
- 관련 용어·ADR: 없음(`.forge/CONTEXT.md`에 해당 항목 없음).
- 사이트 찾기: `rg -n 'data-command-line' apps/desktop/src` (변경 지점은 `ui/useKeyboard.ts` 한 곳, 입력칸 자체는 `ui/CommandLine.tsx`).

## 완료 정의
- 재현 테스트: `cd apps/desktop && bunx vitest run src/__tests__/run-command.test.tsx -t "입력칸에 포커스가 있어도"` — 수정 전에는 실패(red), 수정 후 통과(green). 입력칸을 클릭해 포커스를 준 뒤 `Ctrl+Shift+K`와 `Ctrl+Shift+L`을 각각 눌러 줄이 사라지는지 본다(둘 다 토글 액션 `core.view.command_line`).
- 입력 보호 테스트: 입력칸에 글자를 쓴 뒤 `Ctrl+A`를 눌러도 파일 목록의 선택이 바뀌지 않고, 입력칸의 글자는 그대로다.
- `Mod+K` 유지: 줄이 꺼진 상태에서 `Ctrl+K`가 줄을 켜고 포커스를 주는 기존 시험이 그대로 통과한다.
- 회귀: `cd apps/desktop && bunx vitest run` 전체와 `bunx tsc --noEmit`.
- 사전 상태: 재현 테스트만 미충족(전방 검사). 나머지 항목은 회귀 보호 검사라 수정 전에도 통과한다.
- UI는 실제 앱에서 확인하지 못했음을 run.md에 적는다.

## 작업 조각
- [ ] S1. `useKeyboard.ts`가 명령어 줄 입력칸의 이벤트 중 토글 계열(`core.view.command_line`)만 키맵으로 넘기고 나머지는 입력칸이 받게 하며, 위 세 시험(포커스 중 토글, 입력 보호, `Mod+K` 유지)을 `run-command.test.tsx`에 추가한다 — 완료 기준: 위 완료 정의의 명령이 모두 통과하고 재현 테스트가 수정 전에 실패했음이 run.md에 기록된다.
