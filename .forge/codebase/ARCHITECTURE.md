---
last_mapped_commit: 1a05fb67dd1370370ed7a22974d30ed6dc35eb9b
mapped: 2026-10-14
---

# Architecture

## 전체 구조

- 데스크톱 실행 파일 하나 안에서 Tauri 명령·이벤트가 React 화면과 Rust 기능을 연결한다. 서버 HTTP API를 경유하는 구조가 아니다. 진입점은 `apps/desktop/src-tauri/src/main.rs`와 `apps/desktop/src/main.tsx`다.
- Rust 워크스페이스는 루트 `Cargo.toml`, 프런트엔드 워크스페이스는 루트 `package.json`에 정의한다.
- 화면은 `packages/ts-client/src/backend.ts`의 `Backend` 인터페이스만을 통해 기능을 호출한다. 실제 앱은 `packages/ts-client/src/tauri.ts`, 테스트는 `packages/ts-client/src/fake.ts` 구현을 사용한다.
- UI 상태·비동기 흐름은 `apps/desktop/src/state/store.ts`의 Zustand vanilla store와 `api` 객체에 집중되어 있다. 컴포넌트는 `apps/desktop/src/state/context.tsx`의 컨텍스트와 선택자로 읽는다.

## 시작과 창 수명

1. `apps/desktop/src-tauri/src/main.rs`가 CLI 설치·제거 플래그와 두 번째 실행 요청을 처리하고 `Service<SystemTrash>` 및 Tauri 플러그인을 구성한다.
2. 같은 파일의 `setup`은 설정 저장소, OS 이벤트, 디렉터리 변경, 큐·검색·터미널 이벤트를 연결한다. 단일 인스턴스 설정을 끄거나 `TWIN_DECK_MULTI`를 지정하면 별도 인스턴스를 허용한다.
3. `apps/desktop/src/main.tsx`는 스타일을 읽고 `apps/desktop/src/bootstrap.tsx`의 `start`를 호출한다.
4. `bootstrap.tsx`는 저장된 상태와 홈 경로를 읽어 `App`에 전달한다. 시작 실패는 빈 화면 대신 오류 요소로 렌더링한다.
5. `apps/desktop/src/App.tsx`는 저장소, 액션 레지스트리, 플랫폼별 키맵, 테마·언어 및 화면 컨텍스트를 조립한다.
6. 창 위치·크기는 Tauri window-state 플러그인, 탭 등 앱 상태는 `crates/td-state/src/snapshot.rs`와 `apps/desktop/src/state/store.ts`의 스냅샷 흐름으로 나뉜다.

## Rust 계층과 경계

| 계층 | 구현 위치 | 책임과 연결 |
| --- | --- | --- |
| 파일 인터페이스 | `crates/td-vfs/src/lib.rs`, `crates/td-vfs/src/local.rs` | `Vfs` trait, 로컬 파일 조회·변경, NFC/NFD 경로 처리 |
| 압축 경로 | `crates/td-archive/src/composite.rs`, `crates/td-archive/src/path.rs` | `CompositeFs`가 로컬 경로와 압축 내부 경로를 라우팅 |
| 파일 작업 | `crates/td-ops/src/ops.rs`, `crates/td-ops/src/trasher.rs` | `Ops<V, T>`와 `Control`로 복사·이동·삭제, 충돌·진행·중단·휴지통 처리 |
| 작업 실행 | `crates/td-queue/src/queue.rs`, `crates/td-queue/src/job.rs` | 워커 스레드, 작업 상태, 일시정지·중단, 이벤트 채널 |
| 기능 조합 | `apps/desktop/src-tauri/src/service.rs` | `Service<T: Trasher>`가 파일 작업·감시·검색·클립보드·미리보기를 조합하며 Tauri 명령 구현에서 호출됨 |
| IPC | `apps/desktop/src-tauri/src/commands.rs` | Tauri 명령 래퍼, 이벤트·DTO, specta 등록·생성 |

- 설정은 `crates/td-config/src/load.rs`, `merge.rs`, `store.rs`에서 기본 TOML과 사용자 설정을 병합하고 파일 변경을 감시한다.
- 검색·사용량 분석은 `crates/td-search/src/search.rs`, `find.rs`, `usage.rs`, 디렉터리 감시는 `crates/td-watch/src/lib.rs`에서 담당한다.
- OS 실행·볼륨·터미널·아이콘·CLI 설치 기능은 각각 `crates/td-launch/`, `crates/td-volumes/`, `crates/td-terminal/`, `crates/td-icons/`, `crates/td-cli/`로 분리한다.

## 명령과 이벤트 데이터 흐름

### 조회와 갱신

- 컴포넌트 → `apps/desktop/src/state/store.ts`의 `api` → `Backend` → `TauriBackend` → 생성된 `commands` → Rust `commands.rs` → `service.rs` → 하위 crate 순으로 요청한다.
- Rust 값은 `service.rs` 등의 DTO에서 직렬화되며 `packages/ts-client/src/generated/bindings.ts`가 TypeScript 계약을 제공한다.
- `apps/desktop/src-tauri/src/main.rs`가 Rust 채널 이벤트를 Tauri 이벤트로 내보내고 `TauriBackend`가 구독 인터페이스로 감싼다.
- 저장소는 `onDirChanged`, `onQueueChanged`, `onSearchEvent`, `onConfigChanged`, `onOpenPaths`, `onTerminalEvent` 등을 구독한다. 목록 새로고침과 검색 결과·진행 상태 반영은 `apps/desktop/src/state/store.ts`에서 처리한다.

### 파일 복사·이동

- 키보드·붙여넣기·포인터 드롭 요청이 `apps/desktop/src/state/store.ts`의 `runTransfer`에 모인다.
- 충돌 확인 및 `ask()` 기반 응답을 거쳐 작업을 큐에 넣고, `trackTransfer`가 진행 대화상자와 완료·실패를 처리한다.
- `crates/td-queue/src/queue.rs`의 워커는 `td-ops` 작업을 실행하며 이벤트·진행 수치를 제공한다.
- `apps/desktop/src/ui/DragLayer.tsx`는 포인터 이벤트 기반 내부 드래그를 표시한다. 창 바깥으로 나가는 경우 Rust 네이티브 드래그 호출로 이어진다.

### 설정과 정렬

- `apps/desktop/src/ui/Settings.tsx`가 설정 경로와 컨트롤을 선언하고 `api.setConfigValue`를 호출한다. Rust의 `crates/td-config/src/store.rs`가 사용자 설정을 저장한다.
- 기본값의 원본은 `crates/td-config/src/default.toml`, UI·테스트용 생성본은 `packages/ts-client/src/generated/default-config.json`이다.
- 확장자 컬럼 토글은 별도 boolean 필드가 아니라 `view.table.columns`를 수정한다. `apps/desktop/src/lib/columns.ts`의 `withExtensionColumn`이 기존 순서·정렬 표시·너비를 보존하며 추가·제거한다.
- `apps/desktop/src/ui/FileTable.tsx`의 헤더는 `api.setOrder`를 호출한다. `apps/desktop/src/lib/sort.ts`가 폴더 우선·동률 이름순을 유지하며 확장자 등 선택한 키로 정렬한다.
- 확장자 컬럼이 표시되어도 셀은 비워 두고 파일명에는 확장자를 유지한다. 관련 계약은 `apps/desktop/src/__tests__/columns-sort.test.tsx`가 다룬다.

## 키보드와 액션

- `packages/actions/src/defaults.ts`는 액션 메타데이터·기본 바인딩, `packages/actions/src/registry.ts`는 레지스트리, `packages/actions/src/user-bindings.ts`는 사용자 설정 병합을 담당한다.
- `packages/keybinds/src/chord.ts`와 `keymap.ts`는 플랫폼별 키 해석과 매칭을 담당한다.
- `apps/desktop/src/actions.ts`가 액션을 저장소 API에 연결하고 `apps/desktop/src/ui/useKeyboard.ts`가 스코프와 대화상자 상황에 맞춰 디스패치한다.
- `apps/desktop/src/App.tsx`는 설정 변화에 따라 키맵을 다시 구성한다. 기능키 설정은 `apps/desktop/src/lib/fkeys.ts`를 거친다.

## 미리보기와 플랫폼 기능

- `apps/desktop/src/ui/Preview.tsx`가 미리보기 종류와 각 뷰를 선택한다. 텍스트·JSON·Markdown·이미지·미디어 외에 Office·EPUB·3D 모델 뷰가 별도 컴포넌트다.
- Rust 미리보기 로직은 `crates/td-vfs/src/preview.rs`와 `apps/desktop/src-tauri/src/service.rs`, EPUB 정보는 `apps/desktop/src-tauri/src/epub.rs`에 있다.
- macOS Quick Look은 `apps/desktop/src-tauri/src/quicklook.rs`, Windows Preview Handler는 `apps/desktop/src-tauri/src/preview_handler.rs`와 `preview_host.rs`로 분리한다.
- 미디어 파일 URL 변환은 `packages/ts-client/src/tauri.ts`에서 Tauri asset protocol을 사용한다. React 미리보기 구현은 `apps/desktop/src/ui/AudioView.tsx`, `VideoView.tsx`, `PdfView.tsx`에서 확인한다.
- UI 번역은 `apps/desktop/src/i18n/ko.ts`, `en.ts` 및 `index.ts`, Rust 오류의 UI 번역 연결은 `apps/desktop/src/i18n/rust.ts`에 있다.

## 변경 시 함께 확인할 경계

- 명령·타입 변경: Rust 선언과 `commands.rs` 등록 → `task gen-types` → `packages/ts-client/src/backend.ts`, `tauri.ts`, `fake.ts` → 관련 UI 호출부.
- 설정 변경: `crates/td-config/src/config.rs`와 `default.toml` → 생성 파일 → `apps/desktop/src/ui/Settings.tsx` → 번역 사전·설정 테스트.
- 액션·기본 키 변경: `packages/actions/src/defaults.ts` → `apps/desktop/src/actions.ts` → `docs/05-actions-keybindings.md` → 기능키·키보드 회귀 테스트.
- UI와 Rust 양쪽에 있는 컬럼·압축 경로 규칙은 `apps/desktop/src/lib/columns.ts`, `crates/td-config/src/columns.rs`, `packages/ts-client/src/archive.ts`, `crates/td-archive/src/path.rs`의 일치를 확인한다.
