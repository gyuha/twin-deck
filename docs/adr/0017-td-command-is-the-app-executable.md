# ADR-0017. `td` 명령은 앱 실행 파일 자체이고, Windows 설치 훅은 앱을 한 번 실행해 설치한다

- 상태: Accepted
- 날짜: 2026-10-11

## 맥락

이슈 #45로 터미널에서 `td .`를 치면 Twin Deck이 그 폴더를 열어야 한다(macOS·Windows). 앱 실행 파일을 터미널에서 그대로 실행하면 macOS에서는 앱이 끝날 때까지 터미널을 붙잡고, 이미 떠 있는 앱에 경로를 넘길 방법도 없다. 설치 경로는 Homebrew Cask(macOS), NSIS 설치 파일(Windows), 직접 내려받은 앱(macOS)으로 나뉜다.

## 결정

- **`td`는 별도 프로그램이 아니라 앱 실행 파일 자체다.** macOS의 `td`는 그 실행 파일로 가는 심볼릭 링크(Cask의 `binary ... target: "td"`, 앱 안 설치 액션의 `/usr/local/bin/td`)이고, 실행 파일은 `argv[0]` 이름이 정확히 `td`일 때만 인수를 검사하고 자기 자신을 다시 실행해(`TD_DETACHED=1`) 터미널에서 떨어져 나온다. `tauri dev`·Finder 실행·`twin-deck-desktop` 이름 실행은 영향이 없다. 이미 떠 있는 앱에는 `tauri-plugin-single-instance`(2.x)가 경로를 넘긴다.
- **Windows는 설치 폴더의 `td.cmd`**(`start "" "…exe" %*`)가 앱을 띄운다. 설치 파일의 훅(`windows/hooks.nsh`)은 NSIS 문자열로 PATH를 고치지 않고 **앱을 `--td-install-cli`/`--td-uninstall-cli`로 한 번 실행**한다. 앱은 창을 만들지 않고 `td-cli` 크레이트의 설치·제거만 한 뒤 끝난다. 앱 안의 "명령줄 도구 설치" 액션도 같은 코드를 쓴다.
- 설치·제거 로직은 앱 크레이트가 아니라 C 의존성이 없는 작은 **`crates/td-cli`**에 둔다.

## 결과

- 장점: 새 실행 파일을 빌드·번들·서명하지 않는다. PATH·`td.cmd`를 만드는 논리가 한 곳(`td-cli`)이라 단위 테스트로 확인되고, 이 크레이트는 `cargo check --target x86_64-pc-windows-msvc`로 Windows 컴파일까지 확인된다(앱 크레이트는 `zstd-sys`의 C 빌드 때문에 이 환경에서 불가). NSIS에서 실행해 볼 수 없는 문자열 편집을 피한다.
- 단점: 실행 파일 이름이 `td`일 때만 동작하는 암묵 규칙에 기댄다(링크 이름이 바뀌면 터미널을 붙잡는다). Windows는 터미널에서 떨어져 나오기와 오류 코드를 지키지 못한다(`start`로 띄워서). 설치 파일 훅이 `${MAINBINARYNAME}`이 설치된 exe 이름으로 풀린다고 가정하며 NSIS를 이 환경에서 실행해 보지 못했다.
- 후속 작업: 첫 Windows 빌드에서 설치→`td .`→제거를 사람이 확인한다. `--new-window`·`--existing-tab` 옵션과 Linux 설치는 범위 밖으로 남아 있다.

## 검토한 대안

- 별도의 작은 `td` 실행 파일(Tauri `externalBin`): 인수 검사를 앱을 띄우기 전에 터미널에서 즉시 할 수 있고 시작이 빠르다. 대신 빌드 순서·플랫폼별 이름 규칙·릴리스 스크립트·Cask·설치 파일까지 모두 손봐야 해서 쓰지 않았다.
- NSIS 훅이 직접 `td.cmd`를 쓰고 PATH를 고침: 앱 실행이 필요 없지만 실행해 볼 수 없는 NSIS 문자열 코드가 늘고 앱 안 설치 액션과 논리가 둘로 갈라진다.
