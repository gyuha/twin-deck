# 09. 플랫폼 지원

## 1. 개요

Marta는 macOS 전용(Swift 네이티브, macOS 11 이상)이다 `[높음]`. twin-deck은 macOS, Windows, Linux를 모두 지원하므로 Marta의 macOS 의존 기능마다 대체 구현이 필요하다. 이 문서는 OS별 차이와 대체 방식을 한곳에 모은다. 대체 방식은 대부분 설계안이며 구현 시 각 OS에서 검증한다.

원칙은 세 가지다. 코어 로직은 OS 중립으로 두고 OS 차이는 얇은 어댑터 계층(`td-volumes`, `file-opening-*`, `trash`)에 가둔다. 한 OS에서만 되는 기능은 다른 OS에서 조용히 사라지지 않고 비활성 이유를 표시한다. 3개 OS 모두에서 CI가 돈다([10](10-dev-setup.md)).

## 2. 기능별 OS 대응표

| 기능 | macOS | Windows | Linux |
|---|---|---|---|
| 휴지통 | `trash` 크레이트(Finder 휴지통) | `trash` 크레이트(휴지통) | `trash` 크레이트(freedesktop trash 규격) |
| 볼륨 목록 | Spacedrive 감지 코드 포팅 (`volume/platform/macos`) | 드라이브 문자, 볼륨 GUID (`platform/windows`) | `/proc/mounts`, `/sys`, udisks (`platform/linux`) |
| 언마운트/추출 | `diskutil` 계열 | 안전 제거 API | udisks 또는 `umount` |
| Open With (앱 목록, 앱으로 열기) | `file-opening-macos` | `file-opening-windows` | `file-opening-linux` (`.desktop` 항목) |
| 파일 관리자에서 보기 | Finder | Explorer | `xdg-open` (환경에 따라 다름) |
| 외부 터미널 (F11) | Terminal.app, iTerm | Windows Terminal, cmd, PowerShell | 배포판 기본 터미널. 설정 필요 |
| 전역 Look Up | 라이브 순회, 옵션으로 Spotlight | 라이브 순회 | 라이브 순회 |
| 파일 감시 | FSEvents (notify) | ReadDirectoryChangesW (notify) | inotify (notify) |
| 미리보기 | 앱 내. 옵션: Quick Look | 앱 내 | 앱 내 |
| 웹뷰 | WKWebView | WebView2 | WebKitGTK |
| 패키지 | `.dmg` (서명/공증) | `.msi` 또는 NSIS 설치 | `.AppImage`, `.deb` |
| CLI 등록 | `/usr/local/bin` 링크 또는 앱 내 설치 액션 | PATH 등록 (설치기) | `/usr/local/bin` 또는 패키지 |

Spacedrive 볼륨 감지 경로는 `core/src/volume/detection.rs`, `platform/*`이며 이식 후보다([04](04-spacedrive-reuse.md)). 크레이트로서의 독립성은 아직 확인하지 못했다.

## 3. 수정자 키

macOS의 Cmd/Opt 체계를 Windows/Linux의 Ctrl/Alt로 옮기는 규칙은 [05](05-actions-keybindings.md#4-키-표기와-os-매핑)와 [ADR-0010](adr/0010-cross-platform-keymap.md)에 있다. OS 예약 조합(`Alt+F4`, `Alt+Tab`, `Mod+Q` 등)은 웹뷰가 받지 못하므로 기본 키맵에서 피한다. 표시(Action Bar, Actions Panel)는 OS에 맞춰 기호로 보인다(macOS: ⌘⌥⇧, 그 외: Ctrl/Alt/Shift).

## 4. 숨김 파일

| OS | "숨김"의 정의 | 토글 키 |
|---|---|---|
| macOS | 이름이 `.`로 시작 또는 `hidden` 플래그(`chflags`). Marta 확인은 이름 기준이며 플래그는 미확인 `[알 수 없음]` | `Mod+Shift+.` |
| Windows | 숨김 속성(`FILE_ATTRIBUTE_HIDDEN`), 시스템 속성. 이름의 `.`는 숨김이 아님 | `Ctrl+H` |
| Linux | 이름이 `.`로 시작 | `Ctrl+H` |

`Entry.hidden`은 어댑터가 OS 규칙에 따라 채운다. 표시 토글은 모두 같은 액션(`core.view.hidden`)이다.

## 5. 경로와 파일 이름

| 항목 | macOS | Windows | Linux |
|---|---|---|---|
| 구분자 | `/` | `\` (내부에서는 `/`로 정규화) | `/` |
| 루트 | `/`, `/Volumes/*` | 드라이브 문자(`C:\`), UNC(`\\server\share`) | `/`, `/mnt/*`, `/media/*` |
| 대소문자 구분 | 기본 비구분(APFS 옵션에 따라 다름) | 비구분 | 구분(파일시스템에 따라 다름) |
| 길이 제한 | 이름 255바이트 | 경로 260자 기본, 긴 경로는 `\\?\` 접두 | 이름 255바이트 |
| 금지 문자/예약어 | `:` 표시 문제, `/` | `<>:"/\|?*`, `CON`, `NUL` 등 예약어, 끝의 공백/점 | `/`, `\0` |
| 유니코드 정규화 | 파일 이름이 NFD로 저장되는 경우가 있음 | 보존 | 보존 |

- 이름 변경의 대소문자만 바꾸기: 비구분 파일시스템에서는 임시 이름을 거쳐 두 번 rename한다.
- macOS의 NFD 저장 때문에 한글 이름 검색/정렬/Quick Select 비교 시 정규화가 필요하다(NFC로 비교). 이 문제는 한국어 사용자에게 실제로 발생한다 `[높음]`.
- 로컬 `VfsPath`는 OS 경로와 상호 변환 함수를 하나만 두고 UI/코어 전체가 그것만 쓴다.
- 파일 이름 정렬은 자연 정렬(숫자 인식)을 기본으로 하고 로케일을 고려한다. 세부는 M2에서 확정.

## 6. 권한과 보안 제약

| OS | 이슈 | 대응 |
|---|---|---|
| macOS | 보호 폴더(Desktop, Documents, Downloads, 외장 볼륨 등) 접근에 TCC 권한, 일부는 전체 디스크 접근 권한 필요 | 권한 거부 오류를 감지해 안내 배너를 표시하고 시스템 설정으로 가는 방법을 보여 준다 |
| macOS | 앱 서명과 공증이 없으면 실행 경고 | 사내 배포용 서명 절차를 M5에서 정한다 |
| Windows | 심볼릭 링크 생성은 관리자 권한 또는 개발자 모드 필요 | 생성 실패 시 원인과 안내를 표시 (OP-12) |
| Windows | 파일이 다른 프로세스에서 열려 있으면 삭제/이동 실패 | 항목별 오류로 큐 요약에 표시 |
| Linux | Flatpak/Snap 샌드박스에서는 홈 밖 접근 제한 | 1차 배포는 AppImage/deb. 샌드박스 패키지는 범위 밖 |
| 공통 | 읽기 전용 볼륨, 권한 거부 | 오류 종류별 메시지 |

## 7. 사용자 폴더 변수

Favorites 등에서 쓰는 경로 변수는 OS별로 해석한다.

| 변수 | macOS | Windows | Linux |
|---|---|---|---|
| `${user.home}` | `$HOME` | `%USERPROFILE%` | `$HOME` |
| `${user.downloads}`, `documents`, `desktop`, `pictures`, `music`, `movies` | 표준 폴더 | Known Folder API | XDG user dirs (`videos`는 `movies`로 매핑) |
| `${user.library}`, `${all.applications}`, `${system.applications}` | macOS 전용 | 미정의 | 미정의 |

표준 폴더 조회는 Tauri 경로 API 또는 `directories` 크레이트를 쓴다. 미정의 변수를 즐겨찾기가 참조하면 항목을 건너뛰고 경고한다.

## 8. 터미널

- pty는 `portable-pty`가 3개 OS를 지원한다. Windows에서는 ConPTY를 쓴다.
- 기본 셸: macOS는 `$SHELL`(zsh), Linux는 `$SHELL`, Windows는 PowerShell 또는 설정값.
- **cwd 동기화**(TERM-03)는 셸 통합이 필요하다. 셸이 프롬프트마다 현재 디렉터리를 알리는 방식(예: OSC 7 시퀀스)을 쓰는 안을 우선 검토한다. zsh/bash/fish/PowerShell별로 훅이 다르고, Marta는 중첩 셸과 ssh를 제외한다 `[높음]`. twin-deck의 방식은 M3 착수 시 시험으로 확정한다 `[낮음]`.

## 9. 앱 실행과 CLI

| 항목 | 방식 |
|---|---|
| 인수 | `twin-deck [경로 [경로]] [--existing-tab] [--new-window]` (CLI-01). 두 경로는 각각 좌/우 패널 |
| 단일 인스턴스 | 이미 실행 중이면 그 인스턴스로 경로를 전달한다 (Tauri single-instance 계열 기능의 존재는 착수 시 확인 `[알 수 없음]`) |
| 등록 | macOS/Linux는 설치 액션이 링크를 만든다. Windows는 설치기가 PATH에 등록한다 |

## 10. 위험과 검증 계획

| 위험 | 검증 시점 |
|---|---|
| WebKitGTK에서 가상 스크롤/드래그/F키 이벤트 성능과 동작이 다름 `[중간]` | M1: 3개 OS에서 목록 렌더링과 키 이벤트 스모크 테스트 |
| WebView가 `Ctrl+W`, `F11`, `F12` 등을 가로챔 | M1: 키 입력 실험 표를 만들어 기록 |
| macOS 한글 파일 이름 NFD/NFC 불일치 | M1: 정렬/Quick Select 테스트 케이스 |
| Windows 긴 경로, 예약어, 잠긴 파일 | M2 |
| 볼륨 감지 이식 코드가 macOS 외에서 동작하는지 | M2 |
| 심볼릭 링크 권한 (Windows) | M3 |

## 11. 미확인 과제

| 항목 | 확인 방법 |
|---|---|
| Spacedrive 볼륨 감지 코드의 독립성과 3개 OS 동작 | 소스 열람, 이식 후 각 OS에서 실행 |
| `file-opening-*`의 OS API 의존성 | `Cargo.toml` 열람 |
| macOS 숨김 플래그를 Marta가 인식하는지 | Marta 실행 확인 |
| 단일 인스턴스 기능 | Tauri 플러그인 조사 |
| 셸 통합 방식(OSC 7 등) | M3 시험 |
