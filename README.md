# Twin Deck

키보드 중심으로 쓰는 듀얼 패널 파일 관리자입니다. 두 패널 사이에서 파일을 복사하고 옮기고, 거의 모든 동작을 단축키와 액션으로 실행합니다. Tauri 2(Rust)와 React로 만들었습니다.

![Twin Deck 메인 화면](docs/screenshots/main.png)

## 주요 기능

- **듀얼 패널과 탭**: 왼쪽·오른쪽 패널마다 탭을 둘 수 있고, `Tab`으로 패널을 오갑니다. 패널 폭은 가운데 경계를 끌어 조절합니다.
- **복사·이동·삭제**: `F5` 복사, `F6` 이동, `F7` 새 폴더, `F8` 휴지통, `Shift+F8` 영구 삭제. 작업은 큐에서 돌고 진행 창에서 진행률을 보며, `Return`으로 백그라운드에 보내거나 `Esc`로 중단합니다.
- **이름이 겹칠 때**: 덮어쓰기·건너뛰기·이름 바꿔 복사 중에 고릅니다. "남은 항목에도 같은 선택 적용"을 켜면 다시 묻지 않습니다. 폴더 복사 중 일부 파일이 실패해도 나머지는 계속 복사하고, 실패한 항목은 목록으로 보여 줍니다.
- **드래그 & 드롭**: 파일을 끌어 다른 패널이나 폴더에 놓으면 복사하고, Ctrl을 누른 채 놓으면 이동합니다. 끄는 동안 커서 옆에 복사(`+`)와 이동(`−`) 표시가 나옵니다.

  ![드래그로 복사](docs/screenshots/drag-copy.png)

- **파일 클립보드**: `Cmd/Ctrl+C`, `Cmd/Ctrl+X`, `Cmd/Ctrl+V`가 운영체제의 파일 클립보드와 연동돼서 Finder·탐색기와 파일을 주고받을 수 있습니다. 잘라낸 파일은 붙여 넣을 때 이동합니다.
- **미리보기**: `→` 또는 `Cmd/Ctrl+Y`로 텍스트, 코드(구문 강조), Markdown, JSON, 이미지, PDF를 바로 봅니다. 만화 압축 파일(`.cbz`)은 안의 첫 이미지를 보여 주고, 사운드 파일(mp3·wav·ogg·flac·m4a 등)은 재생 UI만 띄운 뒤 재생 버튼을 클릭해야 재생합니다.

  ![코드 미리보기](docs/screenshots/preview-code.png)

  ![cbz 미리보기](docs/screenshots/preview-cbz.png)

- **아카이브**: ZIP 계열 압축 파일을 폴더처럼 열고, 압축·추출을 큐에서 처리합니다.
- **파일 찾기**: `Cmd/Ctrl+F`로 이름 마스크, 정규식, 파일 내용, 깊이 제한, 제외 패턴을 지정해 찾습니다. 결과는 가상 탭으로 열립니다.
- **드라이브 바**: 패널 위에서 볼륨을 고르고 남은 용량을 보고, 언마운트·꺼내기를 할 수 있습니다.
- **폴더 단축키**: 설정한 폴더로 `Ctrl+0`~`9`로 바로 이동합니다.
- **F키 사용자 지정**: F키마다 내장 동작이나 외부 프로그램 실행을 지정합니다.
- **테마와 글꼴**: 테마 8종과, UI 글꼴·미리보기 글꼴을 따로 지정하는 설정이 있습니다.

## 설치 (macOS)

Twin Deck은 Apple 개발자 인증서로 서명하거나 공증하지 않은 앱입니다. 그래서 내려받은 앱을 처음 열면 macOS(Gatekeeper)가 "확인되지 않은 개발자" 경고로 막습니다. 아래 순서대로 한 번만 허용하면 이후에는 일반 앱처럼 열립니다.

릴리스에는 현재 **Apple Silicon(arm64)용 macOS 빌드**만 있습니다. Intel Mac, Windows, Linux는 아래 "소스에서 빌드"를 따라 직접 빌드하세요.

1. [Releases](https://github.com/gyuha/twin-deck/releases)에서 `twin-deck-<버전>-macos-arm64.zip`을 내려받습니다.
2. 압축을 풀면 `Twin Deck.app`이 나옵니다. 이것을 `/Applications` 폴더로 옮깁니다.
3. 터미널에서 격리 속성(quarantine)을 지웁니다. 가장 확실한 방법입니다.

   ```sh
   xattr -dr com.apple.quarantine "/Applications/Twin Deck.app"
   ```

4. `Twin Deck.app`을 엽니다.

터미널을 쓰지 않으려면 3번 대신 이렇게 합니다.

- 앱을 한 번 열어 봅니다(경고가 뜨고 열리지 않습니다).
- **시스템 설정 → 개인정보 보호 및 보안**으로 가서 아래쪽의 "Twin Deck이(가) 차단되었습니다" 옆 **그래도 열기**를 누르고 암호나 Touch ID로 확인합니다.
- macOS 14 이하에서는 앱을 우클릭(Control+클릭)한 뒤 **열기**를 눌러도 됩니다. macOS 15 이상에서는 이 방법이 막혀서 위의 시스템 설정 방법이나 `xattr`를 써야 합니다.

```
zip 내려받기 → 압축 풀기 → /Applications로 이동 → xattr 로 격리 해제 → 실행
                                                    ↓ 터미널을 쓰지 않을 때
                                    앱 실행(차단됨) → 시스템 설정 > 개인정보 보호 및 보안 > 그래도 열기 → 실행
```

Gatekeeper가 막는 이유는 앱에 문제가 있어서가 아니라 서명과 공증이 없어서입니다. 출처를 신뢰할 수 있을 때만 허용하세요.

## 자주 쓰는 단축키

`Mod`는 macOS에서 `Cmd`, Windows·Linux에서 `Ctrl`입니다. 전체 목록은 `F1` 도움말이나 `Cmd/Ctrl+Shift+P`(Actions Panel)에서 볼 수 있고, 설정 폴더의 `keybindings.toml`로 바꿀 수 있습니다.

| 동작 | 키 |
|---|---|
| 패널 전환 | `Tab` |
| 이동 | `↑` `↓` `PageUp` `PageDown` `Home` `End` |
| 열기 / 상위 폴더 | `Return` / `Backspace` |
| 선택 토글 / 전체 선택 / 선택 해제 | `Space` 또는 `Insert` / `Mod+A` / `Esc` |
| 미리보기 | `→` 또는 `Mod+Y` |
| 복사 / 이동 | `F5` / `F6` |
| 새 폴더 / 새 파일 | `F7` / `Shift+F7` |
| 이름 바꾸기 | `Shift+F6` |
| 휴지통 / 영구 삭제 | `F8` / `Shift+F8` |
| 클립보드 복사 / 잘라내기 / 붙여넣기 | `Mod+C` / `Mod+X` / `Mod+V` |
| 비활성 패널로 보내기 | `Alt+→` / `Alt+←` |
| 복제 | `Mod+D` |
| 파일 정보 | `Mod+I` |
| 파일 찾기 | `Mod+F` |
| 새 탭 / 탭 닫기 | `Mod+T` / `Mod+W` |
| 숨김 파일 표시 | `Mod+Shift+.` |
| 설정 | `Mod+,` |
| 도움말 | `F1` |

## 소스에서 빌드

필요한 것:

- [Rust](https://rustup.rs/) (저장소의 `rust-toolchain.toml`이 stable을 지정합니다)
- [Bun](https://bun.sh/) 1.3 이상, Node 20 이상(`.nvmrc`)
- [Tauri 2 사전 요구 사항](https://v2.tauri.app/start/prerequisites/) (macOS는 Xcode Command Line Tools, Windows는 WebView2와 C++ 빌드 도구)
- [go-task](https://taskfile.dev/) (선택. 없으면 `Taskfile.yml`의 명령을 직접 실행)

```sh
task setup      # 의존성 설치와 툴체인 확인
task dev        # 개발 모드 실행
task test       # Rust와 TS 테스트
task check      # fmt, clippy, 타입 검사
task bundle     # 설치용 번들 만들기 (macOS는 .app, Windows는 NSIS 설치 파일)
task install    # 번들을 만들어 이 PC에 설치 (macOS는 /Applications)
task release    # GitHub 릴리스에 올리기 (gh 로그인 필요)
```

## 설정 파일

설정과 키맵은 TOML입니다. 설정 화면(`Mod+,`)에서 대부분을 바꿀 수 있고, 직접 편집해도 됩니다.

- macOS: `~/Library/Application Support/dev.twindeck.app/config.toml`
- 키맵: 같은 폴더의 `keybindings.toml`

## 문서

- [개요](docs/00-overview.md), [기능 명세](docs/01-feature-spec.md), [아키텍처](docs/02-architecture.md)
- [액션과 키바인딩](docs/05-actions-keybindings.md), [설정](docs/06-config-plugins.md), [UI 명세](docs/07-ui-spec.md)
- [개발 환경과 작업 규칙](docs/10-dev-setup.md)

## 라이선스

개인 및 사내 사용을 전제로 한 비공개 소프트웨어입니다(`UNLICENSED`). 외부 소스의 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.
