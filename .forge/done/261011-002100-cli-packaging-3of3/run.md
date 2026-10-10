# run — td 명령 배포 (3/3, 이슈 #45)

fg-run이 워크플로 없이 직접 실행했다. TDD: Cask 테스트와 `--td-*-cli` 플래그 테스트를 먼저 쓰고 실패를 확인한 뒤 구현했다.

## 슬라이스별 결과
- S1 `scripts/update-homebrew-cask.test.mjs` 5건을 먼저 쓰고(2건 red) `update-homebrew-cask.mjs`에 `binary "#{appdir}/Twin Deck.app/Contents/MacOS/twin-deck-desktop", target: "td"`를 더했다 — ⚠ 구현 중 실수 하나: 설명 주석에 백틱을 넣어 JS 템플릿 문자열이 끊겨 스크립트가 깨졌다. 테스트가 바로 잡아 백틱을 뺐다. 또 "binary가 app 줄 바로 다음"이라는 테스트를 "app 줄 뒤, 둘 사이엔 주석뿐"으로 바로잡았다(주석 줄이 사이에 있는 것이 의도였다).
- S2 Windows 설치 파일 훅 `apps/desktop/src-tauri/windows/hooks.nsh` + `tauri.conf.json`의 `bundle.windows.nsis.installerHooks` — ⚠ **계획과 다른 설계**: 훅이 NSIS 문자열로 `td.cmd`를 쓰고 PATH를 편집하는 대신, **앱 실행 파일을 `--td-install-cli`/`--td-uninstall-cli`로 한 번 실행**한다. 앱이 이 플래그를 받으면 창 없이 `td-cli`의 설치·제거만 하고 끝난다(`cli::manage_flag`/`run_manage`, 단위 테스트 2건). 이 환경에서 실행해 볼 수 없는 NSIS 문자열 편집 코드를 피하고, 2번 계획에서 테스트·Windows 컴파일까지 확인한 코드를 그대로 쓰려는 것이다.
- S3 README 쌍(설치·사용 절 "터미널에서 열기: `td`"), `docs/01`(CLI-01 구현됨), `docs/09` §9, `AGENTS.md` — ✅ as planned
- S4 회귀 확인 — ✅

## DoD baseline → after
1. `bun test scripts/update-homebrew-cask.test.mjs`: 파일 없음 → 5 통과 (binary 줄 1회·위치·기존 줄 유지·결정적·잘못된 버전 거부)
2. `bun test scripts/update-tap.test.mjs`: 8 통과 → 8 통과 (회귀 방지)
3. `tauri.conf.json`의 `bundle.windows.nsis.installerHooks`: 키 없음 → `windows/hooks.nsh`, 파일이 있고 `NSIS_HOOK_POSTINSTALL`·`NSIS_HOOK_PREUNINSTALL`·두 플래그를 담는다 ✅. `cargo build`(tauri-build가 설정을 읽음)가 통과한다. **문자열·경로 확인일 뿐 설치 파일이 동작함을 보이지 않는다.**
4. 문서: `grep -c 'td \.'` README.md 0 → 1, README.en.md 0 → 1, docs/09 0 → 1 ✅ (README 쌍은 같은 명령 예시)
5. 회귀: `release-notes`·`update-manifest` 22 통과, `tsc`·`fmt`·`clippy`(macOS + Windows 대상 `td-cli`) 통과, vitest 1167 통과(기준선만 실패), `twin-deck-desktop` 109, `td-cli` 16, ts-client 65, actions 19, ko/en 키 일치
6. 실제 확인: **하지 못했다.** (Windows) `task bundle:win`으로 설치 파일을 만들어 설치→새 터미널에서 `td .`, 제거→PATH 원복을 사람이 확인해야 한다. 이 환경에는 `makensis`·Windows가 없다. (macOS Homebrew) 릴리스를 공개한 뒤 `brew install --cask`/`brew reinstall`로 `/opt/homebrew/bin/td` 링크를 확인해야 한다. 릴리스 공개는 하지 않았다.

## 어긋난 점·한계
- **Windows 설치 파일은 실행해 보지 못한 코드를 배포 경로에 올린다.** `${MAINBINARYNAME}`이 훅 안에서 설치된 exe 이름(`twin-deck-desktop`)으로 풀린다고 가정했다(Tauri 2 NSIS 템플릿의 정의). 틀리면 설치 직후 훅이 실패해도 설치는 끝나지만 `td`가 등록되지 않는다. 첫 Windows 빌드에서 사람이 확인해야 한다.
- 훅이 앱을 실행하는 동안 설치 파일이 기다린다(`ExecWait`). 앱이 곧바로 끝나므로 지연은 짧아야 하지만 확인하지 않았다.
- `td.cmd`는 per-user 설치(`%LOCALAPPDATA%`)에서 쓰기 가능하다. 관리자 설치(`Program Files`)를 쓰는 설정이면 설치 훅은 관리자 권한으로 돌아 문제없고, 앱 안 설치 액션만 쓰기 실패한다(2번 계획의 한계).
- Homebrew 쪽은 이 변경이 **다음 릴리스를 공개할 때** tap의 Cask에 반영된다. 이미 공개된 v0.6.3의 Cask에는 `binary`가 없다. 릴리스·`update-tap`은 하지 않았다.
- 코드 변경은 커밋하지 않았다(Run all은 실행만 하고 커밋·봉인하지 않는다).
