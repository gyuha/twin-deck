<!-- forge-slug: macos-update-relaunch-launchservices -->
<!-- repaired-by: fg-loop -->
<!-- task: 213 -->
<!-- priority: high -->
<!-- tdd: off -->
# macOS에서 업데이트 뒤 앱을 LaunchServices로 다시 띄운다 (이슈 #137)

## Goal / Non-goals
- Goal: `install_update`가 macOS `.app` 번들에서 실행 중이면, `app.restart()`(새 실행 파일을 옛 프로세스의 자식으로 spawn) 대신 옛 프로세스가 끝나기를 기다렸다가 `/usr/bin/open <번들>`로 다시 띄운다. 그러면 새 앱은 TCC의 책임 프로세스가 자기 자신이 되어, 다운로드·이동식 볼륨 접근 팝업과 다른 앱으로의 파일 드롭이 옛 프로세스에 묶이지 않는다(가설 [중간]).
- Non-goals: 서명 방식 변경, Windows 재시작 경로 변경, 명령 시그니처/Type 변경(gen-types 불필요), "새로 시작할 때 팝업이 안 뜨는" 경우 해결, 이슈 댓글.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 근거: tauri 2.11.6 `process.rs` `restart_macos_app`이 `Command::new(<bundle>/Contents/MacOS/<exe>).spawn()` 후 `exit(0)` (측정). 호출 위치 `apps/desktop/src-tauri/src/commands.rs` `install_update`.
- Definition of Done: loop.md의 C1~C4 통과. C1 새 테스트는 구현 전 실패(red) → 구현 후 통과(green).

## Work slices
- [ ] S1. 순수 함수 두 개와 테스트: 실행 파일 경로 → `.app` 번들 경로(없으면 None), (pid, 번들) → 재시작 명령(`/bin/sh -c '<pid 종료 대기(상한 있음)>; exec /usr/bin/open "$2"' sh <pid> <번들>`처럼 경로를 인자로 넘김) — completion criterion: `cargo test -p twin-deck-desktop relaunch` 통과
- [ ] S2. `install_update`가 macOS·번들 안이면 S1 명령을 분리 실행(spawn)한 뒤 앱을 정상 종료(`app.exit(0)` 등 종료 처리기를 거치는 방식), 아니면 기존 `app.restart()` — completion criterion: C2·C3·C4 통과 (depends: S1)
