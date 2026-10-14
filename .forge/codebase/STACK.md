---
last_mapped_commit: 1a05fb67dd1370370ed7a22974d30ed6dc35eb9b
mapped: 2026-10-14
---
# 기술 스택

## 언어와 실행 환경

- 데스크톱은 Rust 2021 + Tauri 2, 화면은 React 19.1 + TypeScript다. 워크스페이스 최소 Rust 버전은 1.88이며 `rust-toolchain.toml`은 stable과 clippy/rustfmt를 선택한다 (`Cargo.toml`, `apps/desktop/src-tauri/Cargo.toml`).
- JS는 Bun 워크스페이스(`apps/*`, `packages/*`)로 관리하며 선언된 패키지 매니저는 Bun 1.3.0이다. 실제 해석된 의존성은 `bun.lock`, `Cargo.lock`을 기준으로 본다 (`package.json`).
- TS는 ES2022, ESNext 모듈, Bundler 해석, strict 검사, React JSX 변환을 사용한다 (`apps/desktop/tsconfig.json`).
- 주 배포 산출물은 macOS `.app`과 Windows NSIS다. Linux 분기 코드도 있으나 릴리스 워크플로에 Linux 빌드는 없다 (`Taskfile.yml`, `.github/workflows/release.yml`).

## 프런트엔드

| 용도 | 기술과 근거 |
| --- | --- |
| 번들·개발 서버 | Vite 5 + React SWC 플러그인, 포트 1420 고정 (`apps/desktop/vite.config.ts`) |
| 스타일 | Tailwind CSS 4 Vite 플러그인, Spacedrive primitives/tokens (`apps/desktop/package.json`) |
| 상태·긴 목록 | Zustand 5, TanStack React Virtual 3 (`apps/desktop/src/state/store.ts`, `apps/desktop/package.json`) |
| 터미널 | xterm 6와 addon-fit, 초기 개발 의존성 사전 번들 (`apps/desktop/src/ui/TerminalView.tsx`, `apps/desktop/vite.config.ts`) |
| 문서 | react-markdown/remark-gfm, highlight.js, DOMPurify, Mammoth, JSZip, SheetJS (`apps/desktop/src/ui/Preview.tsx`, `apps/desktop/src/ui/OfficeView.tsx`) |
| 3D | Three.js, occt-import-js, Draco 도구 (`apps/desktop/src/ui/ModelView.tsx`, `apps/desktop/package.json`) |
| 테스트 | Vitest 2 + jsdom 25 + Testing Library (`apps/desktop/vite.config.ts`, `apps/desktop/src/test-setup.ts`) |

- SheetJS는 npm 버전 범위 대신 공급자 CDN의 0.20.3 tarball을 의존성으로 지정한다 (`apps/desktop/package.json`).
- SVG 아이콘은 JS에 base64로 인라인하지 않고 파일 URL로 제공한다 (`apps/desktop/vite.config.ts`, `packages/material-icons/src/index.ts`).

## Rust 구성 요소

- 루트 Cargo 워크스페이스에는 앱과 `td-vfs`, `td-archive`, `td-ops`, `td-queue`, `td-config`, `td-search`, `td-volumes`, `td-watch`, `td-state`, `td-launch`, `td-terminal`, `td-cli`, `td-icons`가 있다 (`Cargo.toml`).
- 공통 직렬화는 serde/serde_json, 오류는 thiserror를 쓴다. 설정은 toml 0.8과 주석 보존 편집용 toml_edit 0.22다 (`Cargo.toml`, `crates/td-config/Cargo.toml`).
- 압축은 zip 8.6, tar, flate2, bzip2 및 Unicode 정규화를 사용한다 (`crates/td-archive/Cargo.toml`).
- 파일 감시는 notify 8, 터미널은 portable-pty 0.9, 휴지통은 trash 크레이트를 사용한다 (`crates/td-watch/Cargo.toml`, `crates/td-terminal/Cargo.toml`, `crates/td-ops/src/trasher.rs`).
- macOS 네이티브 API는 objc2/AppKit/Foundation, Windows는 windows/windows-sys를 조건부 의존성으로 둔다 (`apps/desktop/src-tauri/Cargo.toml`, `crates/td-icons/Cargo.toml`, `crates/td-volumes/Cargo.toml`).

## 타입·설정·생성물

- specta 2.0.0-rc.22, tauri-specta 2.0.0-rc.21, specta-typescript 0.0.9는 정확한 버전으로 고정한다. Rust 명령과 타입에서 `packages/ts-client/src/generated/bindings.ts`를 생성한다 (`apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/commands.rs`).
- 기본값 원본은 `crates/td-config/src/default.toml`, UI 테스트용 생성물은 `packages/ts-client/src/generated/default-config.json`이다. `task gen-types`가 바인딩·기본값 및 테마 생성물을 갱신한다 (`Taskfile.yml`).
- 테마 원본은 `apps/desktop/themes/*.yaml`, 생성 스크립트는 `scripts/gen-themes.mjs`다.
- 사용자 설정은 앱 설정 디렉터리의 `config.toml`, 키 설정은 `keybindings.toml`; 창 상태는 JSON이다 (`crates/td-config/src/store.rs`, `crates/td-state/src/snapshot.rs`).
- 확장자 컬럼 표시도 독립 bool이 아니라 기존 `view.table.columns` 목록을 편집한다 (`crates/td-config/src/columns.rs`, `apps/desktop/src/ui/Settings.tsx`).

## 빌드와 도구

- `Taskfile.yml`이 설치·개발·검사·테스트·생성·번들·배포의 진입점이며 `justfile`은 기존 명령 미러다. 보조 배포·테마 스크립트는 Node.js, Windows 설치·릴리스는 PowerShell을 쓴다 (`scripts/`).
- `task test`: Cargo 워크스페이스 테스트 후 Bun 패키지 테스트. `task check`: rustfmt, clippy 전체 타깃, TS 검사 (`Taskfile.yml`).
- Tauri 개발 모드는 Vite URL을 열고 배포 모드는 `apps/desktop/dist`를 포함한다 (`apps/desktop/src-tauri/tauri.conf.json`).
