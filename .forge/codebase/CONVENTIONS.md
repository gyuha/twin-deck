---
last_mapped_commit: 8a4f46c193d6d3ec7cab83bab41bfbf703e170c8
mapped: 2026-10-14
---

# 코드 작성 관례

## 언어와 명명

- `AGENTS.md`는 문서·주석·테스트 설명을 한국어로 작성하도록 정한다. 기존 Rust 테스트 함수에는 영어 이름도 있다.
- `apps/desktop/src/ui/Settings.tsx`처럼 React 컴포넌트 파일은 PascalCase, `apps/desktop/src/lib/sort.ts`처럼 함수 모듈은 소문자 이름을 쓴다.
- TypeScript 변수·함수는 camelCase, 타입·인터페이스는 PascalCase다. Rust 함수·필드는 snake_case이며 공개 DTO의 JSON 표기는 `serde` 속성으로 정한다.
- `apps/desktop/src-tauri/src/commands.rs`의 DTO는 필요에 따라 `#[serde(rename_all = "camelCase")]` 또는 `lowercase`를 사용한다. 설정 필드의 snake_case를 임의로 바꾸지 않는다.
- `apps/desktop/src/i18n/`의 번역 키를 화면에서 조회하며, `packages/ts-client/src/backend.ts`의 `setBackendErrorTranslator`가 Rust 오류 문구 번역을 연결한다.

## TypeScript와 React

- `apps/desktop/tsconfig.json`은 `strict`, `isolatedModules`, `noUnusedParameters`를 켠다. 생성 파일의 미사용 import 때문에 `noUnusedLocals`는 꺼져 있다.
- `apps/desktop/src/state/store.ts`와 `packages/ts-client/src/fake.ts`는 큰따옴표·세미콜론·2칸 들여쓰기를 사용한다. 주변 코드 형식을 따른다.
- 타입 전용 의존성은 `import type`으로 가져온다. Bun 워크스페이스 패키지는 `@twin-deck/ts-client` 같은 이름으로 참조한다.
- `apps/desktop/src/state/store.ts`의 vanilla zustand store가 상태와 동작 API를 관리한다. UI는 store의 선택자를 통해 필요한 값을 구독한다.
- 비동기 파일 작업은 컴포넌트에서 OS API를 직접 호출하지 않고 `packages/ts-client/src/backend.ts`의 `Backend` 인터페이스를 통한다.
- `apps/desktop/src/lib/`는 정렬·컬럼 명세·표시 형식 등 순수 계산을 분리한다. 관련 단위 검증은 `apps/desktop/src/__tests__/lib.test.ts`에 있다.
- `apps/desktop/src/ui/Settings.tsx`의 설정 항목은 `SECTIONS`와 dotted path로 구성한다. 특수 컨트롤도 기존 설정 저장 경로를 사용한다.

## Rust 경계와 오류

- `crates/td-vfs/src/lib.rs`의 `Vfs`, `crates/td-ops/src/trasher.rs`의 `Trasher`처럼 OS 동작은 trait로 분리한다. 실제 구현과 테스트 구현을 교체할 수 있다.
- `apps/desktop/src-tauri/src/commands.rs`는 Tauri 노출과 이벤트 정의를 맡으며, 업무 처리는 `apps/desktop/src-tauri/src/service.rs`로 위임한다.
- `crates/td-vfs/src/error.rs`는 `thiserror::Error`와 crate의 `Result<T>` 별칭을 사용한다. `NotFound`, `AlreadyExists`, 경로를 포함한 `Io`를 구분한다.
- 오류의 경로와 원인 정보를 유지한다. UI 브리지의 예외 래퍼는 `packages/ts-client/src/backend.ts`의 `BackendError`다.
- Rust 포맷 기준은 `Taskfile.yml`의 `cargo fmt --all --check`다. lint는 clippy를 사용하며 알려진 기존 실패와 이번 변경의 실패를 구분한다.
- 플랫폼 전용 코드는 `cfg` 경계 안에 둔다. `AGENTS.md`는 Windows 검증을 위해 C 의존성이 없는 작은 crate에 Windows 코드를 두는 방식을 권한다.
- `crates/td-vfs/src/local.rs`의 NFD 재시도는 macOS/SMB 경로 호환 처리다. 새 파일 연산도 같은 경로 처리 조건을 검토한다.

## 기능 변경 시 연결되는 파일

| 변경 종류 | 연결되는 위치 |
| --- | --- |
| 백엔드 기능 | `apps/desktop/src-tauri/src/commands.rs` → 생성 바인딩 → `packages/ts-client/src/backend.ts`, `tauri.ts`, `fake.ts` |
| Rust DTO/명령 서명 | `task gen-types` → `packages/ts-client/src/generated/bindings.ts` |
| 설정 필드/기본값 | `crates/td-config/src/config.rs`, `default.toml` → 생성 fixture → `apps/desktop/src/ui/Settings.tsx`와 설정 테스트 |
| 액션/기본 키 | `packages/actions/src/defaults.ts`, `apps/desktop/src/actions.ts`, `docs/05-actions-keybindings.md` |
| F 키 기본값 | `apps/desktop/src/__tests__/fkey-bindings.test.tsx` |
| README 변경 | `README.md`와 `README.en.md`를 같은 변경으로 맞추고 첫 줄 언어 링크 보존 |

- 생성 파일의 출처는 `apps/desktop/src-tauri/src/commands.rs`의 최신성 테스트다. 결과만 손으로 고치지 않고 생성 명령을 사용한다.
- `Taskfile.yml`의 `gen-types`는 `scripts/gen-themes.mjs`를 통한 테마 생성도 실행한다.
- 확장자 컬럼 표시 설정은 새 boolean 필드가 아니라 `view.table.columns` 배열을 편집한다. 구현은 `apps/desktop/src/ui/Settings.tsx`, 검증은 `apps/desktop/src/__tests__/settings.test.tsx`에 있다.
- 확장자 컬럼 셀은 비우고 파일명에는 확장자를 유지한다. 이 표시 계약은 `apps/desktop/src/__tests__/lib.test.ts`와 `columns-sort.test.tsx`에 명시돼 있다.

## 상호작용과 변경 기록

- 액션 메타데이터와 키 해석을 분리한다: `packages/actions/src/defaults.ts`, `packages/keybinds/`, `apps/desktop/src/ui/useKeyboard.ts`.
- 대화상자는 `apps/desktop/src/state/store.ts`의 promise 기반 `ask()`를 사용한다. 전송 작업은 같은 store의 `runTransfer`/`trackTransfer` 흐름을 따른다.
- `apps/desktop/src/ui/DragLayer.tsx`의 드래그는 포인터 이벤트 기반이다. 네이티브 HTML5 DnD로 바꾸면 수정 키 및 OS 커서 표시 조건이 달라진다.
- 접근 가능한 역할과 이름을 테스트 식별자로 사용한다. `columnheader`, `aria-sort`, `switch`, `listbox`는 `apps/desktop/src/__tests__/columns-sort.test.tsx`의 동작 검증에도 쓰인다.
- `AGENTS.md`에 따라 커밋 메시지는 한국어이며 `Co-Authored-By` 트레일러를 붙인다.
- 버전을 올릴 때는 `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, `CHANGELOG.md`를 함께 맞춘다.
- `Taskfile.yml`의 `deploy`, `release`는 원격 상태를 변경하므로 일반 테스트 실행의 일부로 취급하지 않는다.
