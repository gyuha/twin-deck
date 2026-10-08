# STATUS — macOS에서 설정 폴더 열기가 동작하지 않는 문제를 고친다 (이름이 `.app`으로 끝나는 폴더)
slug: reveal-config-dir-app-suffix
status: done
executed: 2026-10-08
completed: 2026-10-08
verified: yes (TDD 슬라이스 테스트 td-launch 13건·twin-deck-desktop 50건 통과, 구현 전에는 컴파일 실패 · 이 Mac에서 수동 재현 open <설정 폴더> 종료 코드 1 → open -R config.toml 종료 코드 0 · clippy·fmt 통과 · UI 무변경 · 문서 grep 1건 · 실제 앱에서 설정 폴더 열기 버튼은 미확인 · 전체 실행 중 coalesce 타이밍 테스트가 한 번 흔들렸고 재실행에서 통과)
retro: skipped (fg-next all 자동 진행 — 배운 점은 run.md에 남기고 승격은 이후 fg-learn으로 미룸)
docs updated: docs/06-config-plugins.md
