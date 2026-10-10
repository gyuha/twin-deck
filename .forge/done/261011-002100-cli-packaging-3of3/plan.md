<!-- forge-slug: cli-packaging-3of3 -->
<!-- task: 136 -->
<!-- part: 3/3 -->
<!-- tdd: on -->
# td 명령 배포: Homebrew Cask 링크, Windows 설치 파일의 td.cmd·PATH, README 안내 (3/3)

## 목표 / 하지 않을 것
- 목표: 설치만 하면 `td`가 된다. (GitHub 이슈 #45) macOS는 `brew install --cask gyuha/tap/twin-deck`으로, Windows는 NSIS 설치 파일로. 직접 내려받은 macOS 사용자는 앱 안의 설치 액션(2번)이나 README의 한 줄 명령으로.
  - Homebrew: `scripts/update-homebrew-cask.mjs`가 만드는 Cask에 `binary "#{appdir}/Twin Deck.app/Contents/MacOS/twin-deck-desktop", target: "td"`를 더한다. Homebrew가 이 링크(`/opt/homebrew/bin/td`)를 만들면 `argv[0]`이 `td`가 되어 1번 계획의 "터미널에서 떨어져 나오기"가 동작한다. 갱신 스크립트는 같은 입력에 같은 출력을 내므로(이미 반영돼 있으면 아무것도 바꾸지 않음) 재실행에 안전하다. 기존 `postflight_steps`와 다른 줄은 그대로 둔다.
  - Windows 설치 파일: `tauri.conf.json`의 `bundle.windows.nsis.installerHooks`가 가리키는 `apps/desktop/src-tauri/windows/hooks.nsh`가 설치 후 `$INSTDIR\td.cmd`(2번과 같은 내용)를 쓰고 `$INSTDIR`을 **사용자 PATH**에 더하며, 제거 전에는 그 줄을 빼고 `td.cmd`를 지운다. 이미 PATH에 있으면 더하지 않는다.
  - 문서: `README.md`와 `README.en.md`(쌍, 같은 커밋에서 같이)의 설치·사용 절에 `td .`·`td 폴더 폴더`와 설치 방법(brew, Windows 설치 파일, macOS 직접 내려받기용 앱 액션·`sudo ln -s '/Applications/Twin Deck.app/Contents/MacOS/twin-deck-desktop' /usr/local/bin/td`), 다른 `td`와의 충돌 주의를 쓴다. `docs/09-platform-support.md` §9, `docs/01-feature-spec.md` CLI-01, `docs/05-actions-keybindings.md`를 구현 상태에 맞춘다.
- 하지 않을 것: Cask의 `binary`를 쓰는 것 외의 tap 구조 변경 · 서명·공증 · Linux 패키지 · 버전 올리기·`CHANGELOG.md` 항목·릴리스(릴리스 절차의 일이고 이 계획은 코드·문서만 바꾼다) · `task release`·`update-tap.mjs`를 `DRY_RUN` 없이 실행하는 일

## 기준 문서
- 용어: `.forge/CONTEXT.md`의 "td 명령"
- 관련 ADR: 없음
- 이슈 추적: GitHub 이슈 #45
- 갱신할 문서: README 쌍, `docs/01`, `docs/05`, `docs/09`
- 완료 정의(DoD):
  1. `bun test scripts/update-homebrew-cask.test.mjs` 통과 ≥ 4, 실패 0 (사전 상태: 파일 없음 — 앞으로 가는 확인): 만든 Cask에 `binary` 줄이 정확히 한 번, `target: "td"`와 `Contents/MacOS/twin-deck-desktop` 경로 포함 · 기존 `app "Twin Deck.app"`·`postflight_steps` 줄이 그대로 · 같은 입력으로 두 번 돌려도 출력이 같다 · 잘못된 버전은 거부(기존 동작)
  2. `bun test scripts/update-tap.test.mjs` 통과 (사전 상태: 통과 — 회귀 방지, Cask 내용이 바뀌어도 tap 갱신 흐름은 그대로)
  3. Windows 설치 파일: `apps/desktop/src-tauri/tauri.conf.json`이 유효한 JSON이고 `bundle.windows.nsis.installerHooks`가 존재하는 `hooks.nsh`를 가리킨다(`node -e`로 JSON을 읽어 그 경로 파일이 있는지 확인, 사전 상태: 키 없음). `hooks.nsh`는 설치 후 매크로(`NSIS_HOOK_POSTINSTALL`)와 제거 전 매크로(`NSIS_HOOK_PREUNINSTALL`)를 정의한다. **이 검사는 문자열·경로 확인일 뿐 설치 파일이 실제로 동작함을 보이지 않는다**(macOS에서는 NSIS를 빌드할 수 없다).
  4. 문서: `grep -c 'td \.' README.md README.en.md`가 각 ≥ 1 (사전 상태: 둘 다 0), `grep -c 'td .' docs/09-platform-support.md` ≥ 1, `README.md`·`README.en.md`의 `td` 언급이 서로 대응한다(같은 명령 예시)
  5. 회귀 방지(사전 상태: 이미 통과): `bun test scripts/release-notes.test.mjs scripts/update-manifest.test.mjs`, `cd apps/desktop && bunx tsc --noEmit`, `cargo fmt --check`
  6. 실제 확인(자동 검증 불가, 사람이 한다): Windows에서 `task bundle:win`으로 만든 설치 파일을 설치 → 새 터미널에서 `td .`, 제거 → `td`가 사라지고 PATH가 원래대로. macOS는 공개된 릴리스 이후 `brew install --cask gyuha/tap/twin-deck`·`brew reinstall`로 `/opt/homebrew/bin/td` 링크 확인(릴리스 공개는 사용자가 따로 한다).

## 작업 조각
- [ ] S1. (red→green) `scripts/update-homebrew-cask.test.mjs`를 먼저 쓰고 `update-homebrew-cask.mjs`에 `binary` 줄을 더한다. — 완료 기준: DoD 1, 2
- [ ] S2. `windows/hooks.nsh`(설치 후 `td.cmd` 쓰기와 사용자 PATH 등록, 제거 전 해제)와 `tauri.conf.json`의 `installerHooks`. — 완료 기준: DoD 3, DoD 6의 Windows 부분
- [ ] S3. README 쌍과 `docs/01`·`05`·`09`. (depends: S1, S2) — 완료 기준: DoD 4
- [ ] S4. 회귀 확인. (depends: S3) — 완료 기준: DoD 5
