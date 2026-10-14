---
last_mapped_commit: 8a4f46c193d6d3ec7cab83bab41bfbf703e170c8
mapped: 2026-10-14
---
# 외부 통합

## 로컬 앱 경계와 영속화

- React는 `packages/ts-client/src/tauri.ts`와 생성된 명령 바인딩으로 Rust를 호출한다. 개발·테스트 대역은 `packages/ts-client/src/fake.ts`이며 별도 서버 API를 요구하지 않는다.
- 설정 디렉터리는 Tauri `app_config_dir()`로 정하며 앱 식별자는 `dev.twindeck.app`이다 (`apps/desktop/src-tauri/src/main.rs`, `apps/desktop/src-tauri/tauri.conf.json`).
- 설정/키 바인딩은 TOML, 창별 세션은 `state.json` 또는 `state-<레이블>.json`에 저장한다. 조사한 영속화 구현은 파일 기반이며 외부 DB나 인증 공급자 연결은 없다 (`crates/td-config/src/store.rs`, `crates/td-state/src/snapshot.rs`).
- 로컬 파일 영상·문서·모델은 Tauri asset protocol 또는 백엔드 미리보기 데이터로 읽는다. asset scope는 `**`, CSP는 null이다 (`apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/ui/OfficeView.tsx`, `apps/desktop/src/ui/ModelView.tsx`).

## OS 통합

| 기능 | 접점과 구현 위치 |
| --- | --- |
| 파일 열기·Finder/Explorer 위치 표시 | macOS `open`, Windows `explorer`, Linux `xdg-open`; 외부 편집기 실행 명령도 구성 (`crates/td-launch/src/lib.rs`) |
| 파일 복사·삭제 | 로컬 파일 시스템과 OS 휴지통; macOS 이름 정규화 재시도 (`crates/td-vfs/src/local.rs`, `crates/td-ops/src/trasher.rs`) |
| 볼륨 | OS별 마운트/용량 탐지, macOS `diskutil`, Linux `umount`, Windows 셸 꺼내기·`net use` (`crates/td-volumes/src/detect.rs`, `crates/td-volumes/src/space.rs`, `crates/td-volumes/src/unmount.rs`) |
| 파일 변경 | notify 기반 OS 파일 감시 (`crates/td-watch/src/lib.rs`) |
| 터미널 | portable-pty로 실제 셸 생성, Windows cmd/PowerShell/Git Bash 선택; 그 외 `$SHELL`을 로그인 셸(`-l`)로 열어 `.zprofile`의 PATH를 적용하고, Unix에서는 locale이 없거나 C면 자식에 UTF-8 locale을 주입 (`crates/td-terminal/src/lib.rs`) |
| 클립보드·드래그 | Tauri clipboard-manager, clipboard-rs, drag 크레이트 (`apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/commands.rs`) |
| 앱 창·단축키 | single-instance, window-state, global-shortcut 플러그인 (`apps/desktop/src-tauri/src/main.rs`, `apps/desktop/src-tauri/src/global_hotkey.rs`) |
| 네이티브 아이콘 | macOS AppKit, Windows Shell/GDI (`crates/td-icons/Cargo.toml`, `crates/td-icons/src/`) |
| OS 미리보기 | macOS `qlmanage`, Windows Preview Handler의 COM/자식 창 호스트 (`apps/desktop/src-tauri/src/quicklook.rs`, `apps/desktop/src-tauri/src/preview_handler.rs`, `apps/desktop/src-tauri/src/preview_host.rs`) |
| 명령행 연결·설치 | CLI 설치/통합, macOS AppleScript 도구, Windows NSIS hooks (`crates/td-cli/src/lib.rs`, `apps/desktop/src-tauri/src/cli.rs`, `apps/desktop/src-tauri/windows/hooks.nsh`) |

- 마운트된 네트워크 경로도 로컬 파일 API로 접근한다. 별도 SFTP/SMB 클라이언트 구현과 혼동하지 않는다 (`crates/td-vfs/src/local.rs`, `crates/td-volumes/src/detect.rs`).
- 플러그인 기본 권한은 `main`과 `win-*` 창에 적용한다 (`apps/desktop/src-tauri/capabilities/default.json`).

## 업데이트와 GitHub Releases

- 앱은 Tauri updater로 `https://github.com/gyuha/twin-deck/releases/latest/download/latest.json`을 확인한다. 공개 검증 키와 endpoint는 앱 설정에 있으며 개인 서명 키 값은 소스에 포함하지 않는다 (`apps/desktop/src-tauri/tauri.conf.json`).
- 업데이트 확인·설치는 Rust 명령에서 updater를 호출한다 (`apps/desktop/src-tauri/src/commands.rs`).
- 릴리스 본문과 업데이트 노트의 원본은 `CHANGELOG.md`이며 `scripts/release-notes.mjs`가 버전 항목을 추출한다. `scripts/update-manifest.mjs`는 기존 manifest에 OS별 URL·서명을 병합한다.
- `scripts/release.sh`와 `scripts/release.ps1`은 GitHub CLI로 OS 산출물을 비공개 초안에 올린다. 공개 전 두 OS 산출물 확인은 `scripts/publish-draft.mjs`와 릴리스 스크립트에 있다.
- 서명 환경변수 이름은 `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`다. 키 파일이나 값은 지도 작성 대상이 아니다 (`Taskfile.yml`, `.github/workflows/release.yml`).

## CI·Homebrew

- `.github/workflows/release.yml`은 `workflow_dispatch` 전용이다. macOS 빌드/초안 업로드 → Windows 빌드/초안 업로드 → Ubuntu 공개 순서다. `publish` job은 `release` Environment를 참조하지만 Required reviewers가 없어 승인 없이 곧바로 공개한다.
- `task deploy`는 main 브랜치, 깨끗한 작업 트리, origin/main 일치, 변경 노트, 미공개 버전을 검사한 뒤(Environment 승인자 검사는 제거됨) GitHub CLI로 워크플로를 시작한다 (`Taskfile.yml`).
- GitHub 인증은 워크플로의 `GH_TOKEN`, tap 저장소 쓰기 인증은 별도 GitHub secret을 사용한다. 지도에는 값이나 인증 URL을 보관하지 않는다 (`.github/workflows/release.yml`).
- 공개 후 `scripts/update-tap.mjs`가 최신 공개 릴리스와 macOS ZIP의 SHA-256을 확인하고 `gyuha/homebrew-tap`의 `Casks/twin-deck.rb`를 갱신·push한다. Cask 문자열 생성은 `scripts/update-homebrew-cask.mjs`가 담당한다.
- 외부 웹훅 수신 서버나 사용자 로그인 흐름은 조사한 앱 진입점·배포 구성에서 확인되지 않았다 (`apps/desktop/src-tauri/src/main.rs`, `.github/workflows/release.yml`).
