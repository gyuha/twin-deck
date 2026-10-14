---
last_mapped_commit: 8a4f46c193d6d3ec7cab83bab41bfbf703e170c8
mapped: 2026-10-14
---

# Structure

## 루트 구성

| 경로 | 내용 |
| --- | --- |
| `apps/desktop/` | React 프런트엔드와 Tauri 데스크톱 호스트 |
| `crates/` | 파일시스템·작업·설정 등 Rust 워크스페이스 라이브러리 |
| `packages/` | 공용 TypeScript 패키지와 아이콘 자산 |
| `scripts/` | 설치·릴리스·업데이트 매니페스트·테마·아이콘 생성 스크립트 |
| `.github/workflows/release.yml` | macOS·Windows 빌드 후 승인 없이 공개하는 워크플로 |
| `docs/` | 제품 명세, 기술 문서, ADR, 스크린샷 |
| `.forge/` | 작업 기록·계획·결정 및 코드베이스 지도 |
| `AGENTS.md`, `CLAUDE.md` | 저장소 작업 지침과 Claude용 가져오기 |
| `Cargo.toml`, `Cargo.lock` | Rust workspace와 잠금 파일 |
| `package.json`, `bun.lock` | Bun workspace와 잠금 파일 |
| `Taskfile.yml`, `justfile` | 작업 실행 명령과 기존 미러 |
| `README.md`, `README.en.md`, `CHANGELOG.md` | 한국어·영어 안내 및 버전별 사용자 변경 기록 |

## 프런트엔드

- `apps/desktop/index.html` → `apps/desktop/src/main.tsx` → `bootstrap.tsx` → `App.tsx`가 시작 흐름이다.
- `apps/desktop/vite.config.ts`는 개발·빌드·테스트 설정을 포함한다. `apps/desktop/package.json`에 앱 스크립트와 의존성이 있다.
- `apps/desktop/src/index.css`는 전역 스타일, `apps/desktop/src/state/store.ts`는 상태와 명령 API, `apps/desktop/src/state/context.tsx`는 React 접근 계층이다.
- `apps/desktop/src/actions.ts`는 액션 핸들러, `apps/desktop/src/appMenu.ts`는 앱 메뉴 연결이다.

### 화면별 위치

| 기능 | 주요 파일 |
| --- | --- |
| 양쪽 패널·탭·목록 | `apps/desktop/src/ui/PaneSplit.tsx`, `Pane.tsx`, `TabBar.tsx`, `FileTable.tsx` |
| 이동·경로·드라이브 | `apps/desktop/src/ui/Breadcrumb.tsx`, `DriveBar.tsx`, `VirtualHeader.tsx` |
| 키보드·액션 | `apps/desktop/src/ui/useKeyboard.ts`, `ActionBar.tsx`, `ActionsPalette.tsx`, `Help.tsx` |
| 대화상자·설정 | `apps/desktop/src/ui/Dialog.tsx`, `Settings.tsx`, `FindDialog.tsx`, `MultiRename.tsx` |
| 작업 표시·드래그 | `apps/desktop/src/ui/Queue.tsx`, `DragLayer.tsx`, `ContextMenu.tsx` |
| 미리보기 진입점 | `apps/desktop/src/ui/Preview.tsx` |
| 문서·미디어 | `apps/desktop/src/ui/CodeView.tsx`, `JsonView.tsx`, `MarkdownView.tsx`, `PdfView.tsx`, `AudioView.tsx`, `VideoView.tsx`, `EpubView.tsx` |
| OS·Office·모델 | `apps/desktop/src/ui/QuickLookView.tsx`, `PreviewHandlerView.tsx`, `OfficeView.tsx`, `ModelView.tsx` |
| 터미널·사용량 | `apps/desktop/src/ui/TerminalView.tsx`, `UsageTreemap.tsx` |

### 화면 보조 코드

- `apps/desktop/src/lib/columns.ts`, `sort.ts`, `names.ts`, `format.ts`에 컬럼 명세·정렬·이름·표시 형식을 둔다. `helpSearch.ts`는 도움말 검색, `terminalEngine.ts`는 터미널 화면 엔진 계약·글꼴 처리다.
- `apps/desktop/src/lib/themeColors.ts`, `themes.generated.ts`는 테마 해석과 생성 데이터다.
- `apps/desktop/src/lib/office/`, `apps/desktop/src/lib/model/`은 문서·모델 형식 처리 코드다.
- `apps/desktop/src/i18n/`에는 `ko.ts`, `en.ts`, `locales.ts`, `index.ts`, `rust.ts`, 번역 검사 허용 목록이 있다.
- `apps/desktop/src/__tests__/`에 UI·저장소·순수 함수 테스트를 두고 `fixtures/models/`에 모델 파일을 둔다. 공통 구성은 `apps/desktop/src/test-setup.ts`와 `apps/desktop/src/__tests__/helpers.tsx`다.

## Tauri 호스트

| 경로 | 역할 |
| --- | --- |
| `apps/desktop/src-tauri/src/main.rs` | 앱 생성, 관리 상태, 이벤트 연결, 창·플러그인 구성 |
| `apps/desktop/src-tauri/src/commands.rs` | IPC 명령·이벤트·specta 생성과 생성본 최신성 테스트 |
| `apps/desktop/src-tauri/src/service.rs` | 기능 조합, DTO, 서비스 구현·단위 테스트 |
| `apps/desktop/src-tauri/src/cli.rs` | 앱 실행 인수·CLI 설치 진입 처리 |
| `apps/desktop/src-tauri/src/global_hotkey.rs` | 전역 단축키 |
| `apps/desktop/src-tauri/src/quicklook.rs` | macOS 미리보기 |
| `apps/desktop/src-tauri/src/preview_handler.rs`, `preview_host.rs` | Windows 네이티브 미리보기 |
| `apps/desktop/src-tauri/src/epub.rs` | EPUB 정보 처리 |
| `apps/desktop/src-tauri/tauri.conf.json` | 앱 식별자·버전·창·번들 설정 |
| `apps/desktop/src-tauri/capabilities/default.json` | Tauri 권한 구성 |
| `apps/desktop/src-tauri/windows/hooks.nsh` | Windows NSIS 설치 훅 |
| `apps/desktop/src-tauri/build.rs`, `Cargo.toml` | Tauri 빌드와 Rust 의존성 |

## Rust crate 위치

- `crates/td-vfs/src/`: `lib.rs` 인터페이스, `local.rs` OS 파일 작업, `path.rs` 경로, `entry.rs` 항목, `preview.rs` 미리보기, `names.rs` 이름 처리.
- `crates/td-archive/src/`: `composite.rs` 라우팅, `archive.rs` 읽기, `writer.rs` 쓰기, `compress.rs` 압축, `edit_session.rs` 편집 세션, `path.rs` 내부 경로.
- `crates/td-ops/src/`: `ops.rs` 작업, `trasher.rs` 휴지통, `error.rs` 오류.
- `crates/td-queue/src/`: `queue.rs` 실행·제어, `job.rs` 작업 모델.
- `crates/td-config/src/`: `config.rs` 타입, `default.toml` 기본값, `load.rs` 로드, `merge.rs` 병합, `store.rs` 저장·감시, `columns.rs` 컬럼, `keybindings.rs` 키 설정, `themes.rs` 생성 테마 목록.
- `crates/td-search/src/`: `query.rs` 쿼리, `eval.rs` 평가, `search.rs` 탐색, `find.rs` 찾기, `flatten.rs` 목록 평탄화, `usage.rs` 사용량 분석.
- `crates/td-state/src/`: `snapshot.rs` 앱 상태, `windows.rs` 창 레코드.
- `crates/td-volumes/src/`: `detect.rs` 볼륨 탐지, `space.rs` 공간, `unmount.rs` 해제.
- `crates/td-watch/src/lib.rs`, `crates/td-terminal/src/lib.rs`, `crates/td-cli/src/lib.rs`가 각 기능의 주 구현이다.
- `crates/td-icons/src/mac.rs`, `win.rs`, `pixels.rs`가 플랫폼 아이콘과 픽셀 변환을 구현한다.
- Rust 통합 테스트는 각 crate의 `tests/`, 단위 테스트는 해당 소스의 테스트 모듈에 둔다.

## TypeScript 패키지

| 패키지 | 주요 위치 |
| --- | --- |
| `packages/ts-client/` | `src/backend.ts` 계약, `src/tauri.ts` 실제 연결, `src/fake.ts` 메모리 구현, `src/generated/` Rust 생성본 |
| `packages/actions/` | `src/defaults.ts` 액션·기본키, `src/registry.ts` 레지스트리, `src/user-bindings.ts` 사용자 키 병합 |
| `packages/keybinds/` | `src/chord.ts` 키 해석, `src/keymap.ts` 매칭 |
| `packages/material-icons/` | `src/index.ts` 아이콘 선택, `icons/` SVG, `manifest.json`, `ORIGIN.md`, `LICENSE` |

## 생성·운영·문서 경로

- `Taskfile.yml`의 `gen-types`가 Rust 타입과 기본 설정, 테마 생성 과정을 묶는다. `packages/ts-client/src/generated/bindings.ts`와 `default-config.json`은 원본 Rust/TOML에서 갱신한다.
- `scripts/gen-themes.mjs`가 테마 생성, `scripts/generate-icons.swift`가 앱 아이콘 생성을 담당한다.
- `scripts/release.sh`, `release.ps1`은 OS별 릴리스 경로, `scripts/release-notes.mjs`는 `CHANGELOG.md` 추출·검사다.
- `scripts/update-manifest.mjs`, `publish-draft.mjs`, `update-tap.mjs`, `update-homebrew-cask.mjs`는 업데이트 매니페스트·초안 공개·Homebrew 후처리를 나눈다.
- `docs/00-overview.md`부터 `docs/11-roadmap.md`까지 주제별 명세, `docs/adr/`에 번호가 붙은 결정 기록, `docs/screenshots/`에 사용자 안내용 이미지가 있다.
- `.forge/codebase/`는 전역 공유 구현 지도다. `.forge/`의 계획·완료 기록과 구분하며 도메인 용어집은 이 지도에 옮기지 않는다.

## 파일명과 탐색 규칙

- React 컴포넌트는 `PascalCase.tsx`, 일반 도우미는 `camelCase.ts`, Rust 모듈은 `snake_case.rs` 패턴을 사용한다.
- Rust crate 이름은 `td-*`, TS workspace 패키지는 각 `packages/*/package.json`에 선언한다.
- UI 테스트는 `apps/desktop/src/__tests__/*.test.tsx` 또는 `*.test.ts`, 공용 패키지 테스트는 주로 해당 `src/*.test.ts`에 있다.
- 동작 변경 지점을 찾을 때 화면 파일만 보지 않고 `apps/desktop/src/state/store.ts`, `packages/ts-client/src/backend.ts`, `apps/desktop/src-tauri/src/service.rs` 순으로 호출 경계를 확인한다.
