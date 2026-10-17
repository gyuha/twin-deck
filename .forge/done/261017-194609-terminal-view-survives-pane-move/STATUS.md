# STATUS — 패널을 옮겨도 터미널 화면(스크롤 내용)이 그대로 이어진다 (이슈 #96 ②)
slug: terminal-view-survives-pane-move
status: done
executed: 2026-10-17
completed: 2026-10-17
verified: yes (vitest terminal-pane-move 6 · terminal-engine-reparent 3 · 기존 터미널·탭 84 passed · bun run test desktop 1517 passed · tsc 0 · Rust/바인딩/의존성 diff 0)
retro: skipped (fg-loop 자동 드라이브 — 학습은 run.md에 남기고 승격은 나중의 fg-learn로 미룬다)
docs updated: docs/07-ui-spec.md, README.md, README.en.md
