# 10. 개발 환경과 작업 규칙

## 1. 리포 구조

리포는 Spacedrive와 같은 계열의 모노레포다. Rust 워크스페이스(Cargo)와 JS 워크스페이스(Bun)가 한 저장소에 함께 있다. 구조는 착수 시점의 제안이며, 스캐폴딩에서 조정할 수 있다.

```
twin-deck/
├── apps/
│   └── desktop/                 # Tauri 2 앱
│       ├── src/                 # React 진입점, 화면 조립
│       └── src-tauri/           # Rust: command/event 노출
├── crates/
│   ├── td-vfs/  td-ops/  td-search/  td-volumes/
│   ├── td-terminal/  td-config/  td-plugin/ (M4)
│   └── vendor/                  # Spacedrive 이식 크레이트 (원래 이름 유지)
│       ├── sd-fs-watcher/  sd-task-system/  ...
├── packages/
│   ├── ts-client/               # @twin-deck/ts-client (생성 타입, 훅)
│   ├── actions/                 # @twin-deck/actions
│   ├── keybinds/                # @twin-deck/keybinds (이식)
│   └── ui/                      # @twin-deck/ui (화면 컴포넌트)
├── docs/                        # 이 문서
├── licenses/                    # FSL 전문 등
├── THIRD_PARTY_NOTICES.md
├── Cargo.toml                   # workspace, resolver 2
├── package.json                 # Bun workspaces
├── rust-toolchain.toml
├── justfile
└── .nvmrc
```

이 구조와 [02](02-architecture.md)의 크레이트 표는 대응한다. 두 문서 중 하나를 바꾸면 다른 하나도 함께 바꾼다.

## 2. 사전 요구

| 도구 | 버전 | 비고 |
|---|---|---|
| Rust | stable, 최소 1.81 | `rust-toolchain.toml`로 고정 (Spacedrive 기준: `rust-version = 1.81`, channel `stable`) |
| Bun | 1.3 이상 | Spacedrive `packageManager: bun@1.3.0` |
| Node | 20.18 | `.nvmrc`. 일부 도구용 |
| just | 최신 | 작업 러너 |
| Tauri 사전 요구 | OS별 | macOS: Xcode Command Line Tools. Windows: WebView2, MSVC 빌드 도구. Linux: WebKitGTK 등 개발 패키지 (Tauri 공식 문서의 목록 확인) |

Tauri 사전 요구 패키지 목록은 착수 시 Tauri 공식 문서로 확인한다 `[알 수 없음]`.

## 3. 작업 명령 (`just`)

Spacedrive의 `justfile` 타깃(`setup`, `dev-desktop`, `test`, `build`, `check`, `fmt`)을 따르되 데몬 관련 타깃은 뺀다 `[높음]`.

| 명령 | 동작 |
|---|---|
| `just setup` | Bun 의존성 설치, Rust 툴체인 확인, 타입 생성 1회 실행 |
| `just dev` | Tauri 개발 모드 실행 (Vite + Rust) |
| `just gen-types` | specta로 TS 타입 재생성 |
| `just test` | `cargo test`(워크스페이스) + `vitest` |
| `just check` | `cargo clippy -D warnings`, `cargo fmt --check`, TS 타입 검사, 린트 |
| `just fmt` | Rust/TS 포맷 |
| `just build` | 릴리스 빌드 (현재 OS) |

## 4. 타입 생성

Rust 타입(명령 인수/반환, 이벤트 페이로드, 오류)을 specta로 TS 타입으로 생성한다. 생성 파일은 `packages/ts-client/src/generated/`에 두고 저장소에 커밋한다. Spacedrive는 `core/src/bin/generate_typescript_types.rs`로 5천 줄 이상의 타입을 생성해 `packages/ts-client/src/generated/types.ts`에 둔다 `[높음]`. CI는 생성 결과가 커밋된 파일과 다르면 실패한다(타입 드리프트 방지).

specta의 어떤 배포본을 쓸지는 스캐폴딩 때 확정한다([03](03-tech-stack.md)).

## 5. CI

3개 OS에서 모두 돌린다. 웹뷰 차이와 OS별 파일 작업 차이가 실제 위험이기 때문이다([09](09-platform-support.md)).

| 작업 | macOS | Windows | Linux |
|---|---|---|---|
| `just check` | O | O | O |
| `cargo test` | O | O | O |
| `vitest` | O | 선택 | 선택 (OS 무관 로직은 한 곳이면 충분) |
| 빌드 | O | O | O |
| 아티팩트 | `.dmg` | `.msi`/NSIS | `.AppImage`/`.deb` |

CI 제공자는 이 문서에서 정하지 않는다. 사내 환경에 따라 결정한다.

## 6. 테스트 전략

| 층 | 대상 | 도구 |
|---|---|---|
| Rust 단위 | VFS, 계획 로직, 설정 병합, 충돌 처리, 아카이브 읽기/쓰기 | `cargo test`, `tempfile` |
| Rust 통합 | 실제 임시 디렉터리에서 복사/이동/삭제와 큐 | `cargo test` |
| TS 단위 | 액션 레지스트리, 키 매핑/스코프 해석, 컬럼 명세 파서 | vitest |
| 컴포넌트 | 파일 목록 커서/선택 규칙, 다이얼로그 키보드 조작 | vitest + Testing Library |
| E2E | 키보드만으로 시나리오 수행 | 도구 미정. M2에서 결정 (Tauri WebDriver 등) `[알 수 없음]` |
| 수동 체크리스트 | OS별 웹뷰 차이, 권한, 휴지통, 볼륨 | 문서화된 체크리스트 |

이식 크레이트는 원본 테스트를 함께 가져와 통과시킨다([04](04-spacedrive-reuse.md#4-이식-절차)).

## 7. 작업 규칙

| 규칙 | 내용 |
|---|---|
| 브랜치 | `main`에서 직접 작업하지 않는다. 기능/문서마다 feature 브랜치를 만든다 (`feat/...`, `docs/...`, `fix/...`) |
| 커밋 | 작은 단위, 의미 있는 메시지. 이식 커밋은 "복사 + 최소 조정"만 담고 기능 변경은 분리한다 |
| 이식 코드 | 파일 헤더와 `THIRD_PARTY_NOTICES.md` 갱신 없이 이식 코드를 커밋하지 않는다 ([04](04-spacedrive-reuse.md#5-라이선스와-출처-표기)) |
| 문서 | 동작을 바꾸는 변경은 관련 문서와 함께 수정한다. 큰 결정은 ADR을 추가한다 |
| ADR | `docs/adr/NNNN-제목.md`. 상태: Proposed, Accepted, Superseded. 번호는 재사용하지 않는다 |
| 미확인 항목 | 확인하면 문서의 `[알 수 없음]`을 확정 값과 출처로 바꾼다 |
| 테스트 | 실패하는 테스트를 건너뛰거나 끄지 않는다. 원인을 고친다 |

## 8. 착수 순서 (스캐폴딩 체크리스트)

M0의 세부 항목이다([11](11-roadmap.md)).

1. Cargo/Bun 워크스페이스, 툴체인 파일, `justfile` 생성
2. `apps/desktop`에 Tauri 2 + React 19 + Vite + Tailwind v4 최소 앱 생성, 3개 OS에서 실행 확인
3. specta 타입 생성 파이프라인 시험 (업스트림/fork 결정)
4. `sd-fs-watcher`, `sd-task-system` 이식 (복사 → 라이선스 조정 → 원본 테스트 통과)
5. `@twin-deck/keybinds` 이식 (스코프 교체)
6. `THIRD_PARTY_NOTICES.md`, `licenses/` 작성
7. CI 파이프라인 (3개 OS)
8. 웹뷰 키 입력 실험 표 작성 ([09](09-platform-support.md) 10절)

## 9. 미확인 과제

| 항목 | 확인 방법 |
|---|---|
| Tauri 사전 요구 패키지의 최신 목록 | Tauri 공식 문서 |
| Spacedrive의 린트/포맷 도구 | 루트 설정 파일 열람 |
| E2E 도구 | M2 |
| CI 제공자 | 사내 환경 확인 |
