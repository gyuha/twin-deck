# STATUS — 명령어 줄 입력칸에 포커스가 있을 때도 토글 키가 동작한다 (이슈 #119)
slug: command-line-toggle-while-focused
status: done
executed: 2026-10-24
completed: 2026-10-24
verified: yes (vitest -t "입력칸에 포커스가 있어도" → 2 passed(수정 전 2 failed), -t "입력 보호" → 1 passed, 전체 vitest → 1637 passed, tsc → no errors; 실제 앱 확인은 못 함)
retro: skipped (fg-loop 자동 구동 — 배운 점은 run.md에 남기고 승격은 나중의 fg-learn로 미룸)
docs updated: none
