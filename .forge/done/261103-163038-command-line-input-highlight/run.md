# 실행 기록 — 명령어 줄 입력칸 구문 강조 (#210)

실행: Paseo ui 역할 에이전트 ui#64BE(claude-sonnet-5-5), 검토 review#2C86(codex gpt-6-sol). TDD.

- S1 강조 레이어 테스트 6개 작성(구현 전 6/6 실패 확인) — ✅ 계획대로
- S2 투명 글자 input + 색칠 레이어(highlight.js bash), scrollLeft 동기화 — ⚠ 검토 후 보강: ↑/↓ recall 뒤 syncScroll 추가 + 테스트 1개
- S3 `.hljs-variable` 색 규칙(`--color-status-info`) — ⚠ 검토 후 보강: 명령어 줄 레이어 안에서만 기울임·굵게를 꺼 글자 폭을 입력칸과 맞춤
- S4 실제 앱 확인 — 사용자 UAT 대기

## 계획 대비 어긋난 점
- review가 `.hljs-comment` 기울임꼴·`.hljs-strong` 굵게가 투명 입력 글자와 폭이 달라 캐럿이 어긋날 수 있다고 지적(중간) → `[data-command-line-highlight] * { font-style: normal; font-weight: inherit; }`로 레이어 안에서만 고정. 코드 미리보기 모양은 그대로.
- recall 뒤 scrollLeft 동기화 누락(낮음) → 수정. 추가 테스트는 수정 뒤에 써서 red를 확인하지 못했다.
- 보안: highlight.js는 정상·실패 경로 모두 escape, 미등록 언어는 예외 — XSS 없음(review 확인).

## DoD baseline → after
1. command-line-highlight.test.tsx: 파일 없음 → 7개 통과
2. command-history·run-command: 통과 → 통과(대상 3파일 32개)
3. tsc --noEmit: 0 → 0
4. grep -c hljs-variable index.css: 0 → 1
5. 실제 앱 확인: 대기
전체 vitest(1차 구현 직후): 199 파일 통과·1 스킵, 1695 테스트 통과.

## Failed attempts
- 1: 사용자 UAT에서 `git` 등 외부 명령이 강조되지 않음(highlight.js bash는 내장 명령만 칠함) / 명령 자리(줄 첫머리, `|`·`&&`·`||`·`;` 뒤) 첫 단어를 명령 색으로 칠하도록 보강 — 사용자 결정

## 재실행(보강) 결과
- S2 보강: `lib/highlight.ts`에 `highlightCommandLine()` 추가 — 명령 자리 단어(줄 첫머리, 따옴표·주석 밖 `|`·`&&`·`||`·`;`·`(` 뒤, `VAR=값` 뒤)를 escape 후 `hljs-built_in`으로, 나머지는 highlight.js로. `>&2`·`2>&1`의 `&`는 경계 아님, `if`·`then` 등 예약어는 건너뜀(에이전트 판단 보완).
- 구현 전 새 테스트 4개 실패 확인 → 38개 통과, tsc 0, 전체 vitest 1702 통과.
- 한계: heredoc·`{ ...; }` 그룹 등 복잡한 문법은 다루지 않음.
