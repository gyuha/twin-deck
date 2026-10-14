---
last_mapped_commit: 1a05fb67dd1370370ed7a22974d30ed6dc35eb9b
mapped: 2026-10-14
---

# 테스트와 검증

## 실행 진입점

| 목적 | 명령과 근거 |
| --- | --- |
| 전체 Rust + JS | `task test` — `Taskfile.yml`에서 `cargo test --workspace` 후 `bun run test` 실행 |
| JS 워크스페이스 | `bun run test` — 루트 `package.json`이 각 패키지의 test 스크립트 실행 |
| 정적 검사 | `task check` — Rust fmt, clippy 전체 대상, JS typecheck |
| 프런트 타입 | `bun run typecheck` 또는 `cd apps/desktop && bunx tsc --noEmit` |
| Rust 특정 테스트 | `cargo test -p td-ops copy_dir` |
| 서비스 테스트 | `cargo test -p twin-deck-desktop preview_cbz` |
| UI 특정 테스트 | `cd apps/desktop && bunx vitest run src/__tests__/drag-drop.test.tsx -t "이동"` |
| 생성 파일 갱신 | `task gen-types` — `UPDATE_BINDINGS=1`로 최신성 테스트 및 테마 생성 실행 |
| 스크립트 단위 테스트 | `bun test scripts/release-notes.test.mjs` 등 파일을 명시해 실행 |

- 루트 JS 스크립트는 Bun 워크스페이스의 test 스크립트를 호출한다. `scripts/*.test.mjs`는 해당 목록에 자동 포함되는 것으로 가정하지 않는다.
- `.github/workflows/`에서 확인한 워크플로는 `release.yml`이다. 로컬 `task check`/`task test`가 일반 CI에서 자동 실행된다고 가정하지 않는다.

## UI 테스트 구성

- `apps/desktop/vite.config.ts`: Vitest, `environment: "jsdom"`, globals, `src/test-setup.ts`.
- `apps/desktop/src/__tests__/`에 기능별 `*.test.tsx`와 순수 함수 `*.test.ts`가 있다.
- `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`으로 사용자 입력과 화면 상태를 검증한다.
- `apps/desktop/src/__tests__/helpers.tsx`의 `renderApp`은 `App`에 backend·platform·초기 경로·snapshot을 주입하고 목록 준비를 기다린다.
- 같은 helper의 `list`, `entryNames`, `cursorName`, `selectedNames`, `activePane`가 목록 및 선택 상태 관찰을 공통화한다.
- helper의 기본 platform은 `linux`다. macOS의 Command 키 동작 등을 확인하려면 platform 인수를 지정해야 한다.
- `seedBackend`는 기존 테스트용 고정 액션바를 설정한다. 앱의 실제 기본 F 키 표시 검증과 fixture 기본값을 혼동하지 않는다.
- 비동기 결과는 `waitFor`/`findByRole`로 기다리고, 접근 가능한 role/name과 `aria-*` 속성을 주로 검증한다.

## Backend 대역과 범위

- `packages/ts-client/src/fake.ts`의 `FakeBackend`는 `Backend`를 구현하며 메모리 파일 트리·설정·작업 큐·검색 이벤트를 제공한다.
- `seed()`로 파일/디렉터리, `setConfig()`로 설정, `setTimes()`로 시간을 구성한다.
- 기본 큐 모드 `instant`는 즉시 처리한다. `manual`과 `advance()`는 진행·중단·일시정지 시나리오에 쓴다.
- clipboard, trashed, savedStates 등 관측 가능한 기록으로 외부 호출의 의도를 검증한다. 실제 OS 부작용을 증명하는 기록은 아니다.
- `defaultLoaded()`는 `packages/ts-client/src/generated/default-config.json`을 복제한다. Rust 기본값과 UI fixture의 연결은 생성 파일 최신성 테스트가 보증한다.
- `packages/ts-client/src/client.test.ts`, `filedrop.test.ts`, `terminal.test.ts`, `cli-install.test.ts`는 브리지 기능을 별도로 검사한다.
- `packages/actions/src/actions.test.ts`, `packages/keybinds/src/keybinds.test.ts`는 액션/키 처리의 패키지 단위 검증이다.

## 주요 회귀 테스트 위치

| 영역 | 파일 |
| --- | --- |
| 컬럼·정렬·기본 정렬 키 | `apps/desktop/src/__tests__/columns-sort.test.tsx` |
| 설정 저장·다시 로드·기본값 복원 | `apps/desktop/src/__tests__/settings.test.tsx` |
| 컬럼 파싱·표시·정렬 함수 | `apps/desktop/src/__tests__/lib.test.ts` |
| 포인터 드래그·외부 파일 드롭 | `apps/desktop/src/__tests__/drag-drop.test.tsx`, `external-drop.test.tsx` |
| 가상 목록·스크롤 | `apps/desktop/src/__tests__/virtual-list.test.tsx`, `scroll-follow.test.tsx` |
| 언어 키·번역·Rust 오류 | `apps/desktop/src/__tests__/i18n-keys.test.ts`, `i18n-backend-errors.test.ts`, `i18n-rust-messages.test.ts` |
| 문서 미리보기 정제 | `apps/desktop/src/__tests__/office-sanitize.test.ts` |
| F 키 목록 | `apps/desktop/src/__tests__/fkey-bindings.test.tsx` |

- 확장자 컬럼 테스트는 기본 OFF, 빈 확장자 셀, 확장자를 포함한 파일명, 양방향 정렬, 커서 보존, 반대 패널 독립성을 검증한다.
- 설정 테스트는 기존 컬럼의 정렬·너비 명세 보존과 다시 로드한 ON 상태를 검증한다. Rust TOML 컬럼 파싱은 `crates/td-config/tests/config.rs`에서 별도로 검사한다.

## Rust 테스트 구성

- `crates/*/tests/`의 통합 테스트와 `src` 안의 `#[cfg(test)]` 단위 테스트를 함께 사용한다.
- `crates/td-ops/tests/common/mod.rs`는 `tempfile::TempDir`, `LocalFs`, `FakeTrash`로 격리한 파일 작업 fixture를 만든다. 실제 사용자 휴지통을 사용하지 않는다.
- `crates/td-ops/tests/overwrite_safety.rs`, `archive_ops.rs`, `normalize.rs`, `scenario.rs`는 덮어쓰기·압축·이름 정규화·복합 작업을 다룬다.
- `apps/desktop/src-tauri/src/service.rs` 내부 테스트는 GUI 실행 없이 서비스 계층을 검증한다. 파일 fixture에도 `tempfile`을 사용한다.
- `apps/desktop/src-tauri/src/commands.rs`의 `bindings_are_up_to_date`, `default_config_fixture_is_up_to_date`는 생성 결과와 저장소 파일의 일치를 확인한다.
- `scripts/update-tap.test.mjs`는 로컬 bare 저장소를 사용한다. `scripts/publish-draft.test.mjs`, `update-manifest.test.mjs`, `update-homebrew-cask.test.mjs`도 배포 보조 코드의 별도 테스트다.

## 한계와 검증 해석

- `apps/desktop/src/test-setup.ts`는 `clientHeight=480`, 자식 style 기반 `scrollHeight`를 제공한다. jsdom 테스트는 실제 레이아웃·스크롤을 재현하지 않는다.
- 같은 파일의 포인터 캡처·`scrollIntoView` shim은 API 호출 오류만 피한다. OS 커서 표시나 창 밖 네이티브 드래그가 동작한다는 증거가 아니다.
- Node Blob을 jsdom Blob으로 변환하는 FileReader shim이 있다. `@spacedrive` 경로 관련 검증은 `apps/desktop/src/__tests__/spacedrive-path.ts`도 참고한다.
- WKWebView 미디어·PDF·실제 포인터 동작은 별도 앱 확인이 필요하다. `AGENTS.md`의 격리 인스턴스 지침을 따르고 사용자 앱과 같은 실행 파일 이름으로 프로세스를 선택하지 않는다.
- `AGENTS.md`는 `service::tests::coalesce_*`의 병렬 실행 시간 민감성과 `service.rs` 테스트의 기존 `root.clone()` clippy 실패를 명시한다. 현재 지도 작성에서 재실행한 결과는 아니다.
- 변경 crate의 `cargo clippy -p <crate> -- -D warnings`로 실제 변경의 lint 상태를 구분한다. 전체 검사 실패를 모두 기존 문제로 단정해서도 안 된다.
- macOS에서 전체 Windows 앱 교차 검사는 `zstd-sys`/MSVC C 도구 문제로 제한된다. `crates/td-cli`는 `cargo clippy -p td-cli --target x86_64-pc-windows-msvc -- -D warnings`로 검증할 수 있으며 NSIS는 Windows 빌드가 필요하다.
- 이 지도는 테스트 구조와 명령을 소스에서 조사했다. 새 테스트 실행이나 전체 통과 결과를 주장하지 않는다. 커버리지 백분율 기준도 확인한 설정에는 없다.
