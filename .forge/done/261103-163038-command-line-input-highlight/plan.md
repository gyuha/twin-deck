<!-- forge-slug: command-line-input-highlight -->
<!-- task: 210 -->
<!-- tdd: on -->
# 명령어 줄 입력칸 구문 강조 (이슈 #157 ①)

## 목표 / 비목표
- 목표: 명령어 줄(`ui/CommandLine.tsx`) 입력칸에 입력한 셸 한 줄을 `highlight.js` bash 문법으로 실시간 색칠한다. 항상 켜져 있다(설정 없음).
- 비목표:
  - 직접 만든 토크나이저(외부 명령 이름·옵션 색칠) — highlight.js가 칠하지 않는 `git`·`grep`·`-v`는 무채색으로 둔다(사용자 결정).
  - PATH에 명령이 있는지 초록/빨강 표시, alias 인식, 자동완성.
  - 강조를 끄는 설정 키.
  - Show Command Line 토글이 포커스를 주는 동작 변경(이슈 ①-포커스 항목은 이번 범위 아님).

## 기준 정보
- 용어: 명령어 줄 = 앱 하단의 셸 한 줄 입력칸(이슈 #110). CONTEXT.md 해당 용어 없음.
- 관련 ADR: 없음
- 측정한 사실: `bun -e`로 highlight.js bash를 돌려 보니 `git commit -m "msg $HOME" --amend | grep -v foo`에서 문자열만 `hljs-string`, `$HOME`은 `hljs-variable`, `cd`·`ls`·`echo`·`pwd`는 `hljs-built_in`, `# …`은 `hljs-comment`이다. `index.css:41-46`에 `.hljs-*` 색 규칙이 테마 토큰으로 있지만 `.hljs-variable` 규칙은 없다(`grep -c hljs-variable apps/desktop/src/index.css` → 0).
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/command-line-highlight.test.tsx` 통과 (작성 시점: 파일 없음 → 실패, 전향 검사)
  2. `cd apps/desktop && bunx vitest run src/__tests__/command-history.test.tsx src/__tests__/run-command.test.tsx` 통과 (회귀 방지 — 기록 탐색·실행이 그대로; 작성 시점 통과가 정상)
  3. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 방지; 작성 시점 0)
  4. `grep -c "hljs-variable" apps/desktop/src/index.css` ≥ 1 (작성 시점 0)
  5. 실제 앱(WKWebView, AGENTS.md "Verifying in the real app"의 격리 실행)에서 사람이 확인: 긴 명령을 입력해 가로로 넘칠 때·커서를 처음/끝으로 옮길 때·한글 조합 중에 색 레이어 글자가 입력 글자와 어긋나지 않고, 캐럿이 보인다. jsdom으로는 확인할 수 없는 항목이다.

## 작업 조각
- [ ] S1. (ui) 강조 레이어 테스트를 먼저 쓴다: 입력값에 따라 레이어에 `.hljs-string`·`.hljs-variable` span이 생김, ↑/↓ 기록 불러오기와 IME 조합 중에도 레이어 글자 = 입력 글자, 입력칸이 비활성(로컬 아님)일 때 레이어도 프롬프트 외 글자 없음 — 완료 조건: 새 테스트가 구현 전 실패한다
- [ ] S2. (ui) `CommandLine.tsx`에 투명 글자(`color: transparent`, `caret-color` 유지) input 아래로 같은 글꼴·패딩의 색칠 레이어를 겹치고, input의 `scrollLeft`를 레이어에 맞춘다(입력·키·선택·scroll 때). 하이라이트는 `lib/highlight.ts`의 등록 방식을 따르고 출력은 escape된 결과만 쓴다 — 완료 조건: DoD 1·2·3 통과 (depends: S1)
- [ ] S3. (ui) `index.css`에 `.hljs-variable` 색 규칙 한 줄 추가(코드 미리보기의 변수 색도 같이 바뀌는 것은 수용됨) — 완료 조건: DoD 4
- [ ] S4. 실제 앱에서 DoD 5를 확인하고 결과를 run 노트에 남긴다 — 완료 조건: DoD 5 확인 기록 (depends: S2, S3)
