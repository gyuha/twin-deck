# 03. 기술 스택

## 1. 원칙

Spacedrive v2와 같은 스택을 쓴다. 버전은 Spacedrive 기준 커밋 `6dfeccf`(2026-07-28)에서 읽은 값이며 `[높음]`, twin-deck이 새로 고르는 항목은 설치 시점의 최신 안정판을 확인해서 확정한다 `[알 수 없음]`. 이 문서의 버전 숫자는 착수 시 `Cargo.toml`, `package.json`에 그대로 옮기지 말고 한 번 더 확인한다.

Spacedrive가 쓰지만 twin-deck은 쓰지 않는 기술은 3절에 이유와 함께 적었다.

## 2. 스택 표

| 계층 | Spacedrive | twin-deck 선택 | 비고 |
|---|---|---|---|
| 언어 (코어) | Rust, `rust-version = 1.81`, toolchain `stable` | 같음 | |
| 비동기 런타임 | Tokio | 같음 | |
| 데스크톱 셸 | Tauri 2 (`tauri 2.9.2`, `wry 0.53.5`, `tao 0.34.5` 해석됨) | Tauri 2 | CLI는 `@tauri-apps/cli ^2.1` |
| 프론트엔드 | React 19.1.0 | 같음 | |
| 번들러 | Vite ^5.4.9, `@vitejs/plugin-react-swc ^4` | 같음 | |
| 스타일 | Tailwind CSS ^4.1 (`@tailwindcss/vite`) | 같음 | |
| 서버 상태 | `@tanstack/react-query ^5.90.7` | 같음 | |
| 표 | `@tanstack/react-table ^8.21.3` | 같음 | |
| 가상 스크롤 | `@tanstack/react-virtual ^3.13.12` | 같음 | |
| 클라이언트 상태 | zustand 5 | 같음 | |
| 드래그 앤 드롭 | `@dnd-kit`, `react-selecto` | 같음 | 드래그 선택은 `react-selecto` 대신 자체 구현이 필요할 수 있음 `[낮음]` |
| UI 프리미티브 | radix, framer-motion, `@spacedrive/primitives`, `tokens` (외부 저장소 `spacedriveapp/spaceui`, MIT) | radix와 `@spacedrive/tokens`, `primitives` | npm 게시 확인(2026-10-01): `tokens` 0.2.3, `primitives` 0.2.4. 저장소 MIT, 패키지 매니페스트에는 license 필드 없음 `[높음]`. `tokens`는 도입함 |
| 타입 생성 | Specta (git fork `jamiepine/specta`) | specta 계열 | 업스트림 릴리스가 twin-deck 요구를 충족하는지 스캐폴딩 때 확인 |
| 패키지 매니저 | Bun 1.3.0 (`packageManager`), Node 20.18 (`.nvmrc`) | Bun, Node 20.18 | |
| 작업 러너 | `just` (`justfile`) | 같음 | |
| Rust 워크스페이스 | resolver 2 | 같음 | |
| 라우터 | react-router-dom 6.20.1 | **사용 안 함** | 3절 |

## 3. Spacedrive에서 의도적으로 뺀 것

| 기술 | Spacedrive 용도 | 뺀 이유 |
|---|---|---|
| 별도 데몬 (`sd-daemon`) + TCP RPC | 프로세스 분리, 다중 클라이언트 | 클라이언트가 하나뿐이다 ([ADR-0003](adr/0003-in-process-ipc.md)) |
| SeaORM + SQLite | 라이브러리/인덱스 저장 | 목록은 라이브 조회 ([ADR-0004](adr/0004-no-database.md)) |
| iroh (P2P) | 기기 간 동기화 | 범위 밖 |
| LanceDB, FastEmbed | 벡터 검색 | 범위 밖 |
| OpenDAL | 클라우드 스토리지 | 범위 밖 |
| wasmer | wasm 확장 | 플러그인은 Lua 기본안 ([ADR-0008](adr/0008-plugin-language.md)) |
| React Native + Expo | 모바일 앱 | 범위 밖 |
| react-router | 탭마다 라우터 | 탭은 라우팅이 아니라 상태다. 탭 상태 객체로 충분 |

`sd-core` 자체는 의존하지 않는다. `default = ["wasm"]` 피처를 포함한 대규모 모놀리스이고, 목록 조회가 DB에 등록된 위치만 다루기 때문이다 ([04](04-spacedrive-reuse.md)).

## 4. twin-deck이 추가로 선택하는 기술

Spacedrive에 없거나 twin-deck 요구에 맞게 새로 고르는 항목이다. 버전은 모두 확정 전이다.

| 용도 | 후보 | 이유/확인 사항 |
|---|---|---|
| 터미널 UI | `ghostty-web` 0.4.0 | Ghostty의 VT 엔진(WASM)을 xterm.js와 같은 API로 쓴다. wasm은 JS 안에 base64로 내장돼 별도 파일 요청이 없다(이슈 #46). 처음 계획은 xterm.js였다 |
| pty | `portable-pty` | 3개 OS 지원 |
| 휴지통 | `trash` 크레이트 | Spacedrive 삭제 전략이 `trash 3.3.1` 사용 `[높음]` |
| 파일 감시 | `notify` (`sd-fs-watcher` 경유, 8.2) | |
| ZIP | `zip` 크레이트 | 읽기/쓰기 |
| tar 계열 | `tar`, `flate2`, `bzip2` | 읽기 전용부터 |
| rar | `unrar` 계열 또는 외부 도구 | 라이선스와 제약 확인 필요 `[알 수 없음]` |
| 설정 | `toml`, `serde` | |
| 오류 | `thiserror` | |
| 로그 | `tracing` | |
| Lua (M4) | `mlua` (Lua 5.4) | Marta가 Lua 5.4.7을 번들 |
| 검색 순회 | `walkdir` 또는 `ignore` | `ignore`는 기본이 `.gitignore` 준수다. 파일 관리자에서는 끄고 써야 한다 |
| 테스트(Rust) | `cargo test` | |
| 테스트(TS) | vitest | 컴포넌트/유닛. E2E 도구는 M2에서 결정 |
| 린트/포맷 | `cargo clippy`, `cargo fmt`, Biome 또는 ESLint+Prettier | Spacedrive의 사용 도구를 확인해 맞춘다 `[알 수 없음]` |

## 5. 플랫폼별 웹뷰

Tauri는 OS 웹뷰를 쓴다. macOS는 WKWebView, Windows는 WebView2, Linux는 WebKitGTK다. 같은 React 코드가 세 엔진에서 다르게 동작할 수 있고, 특히 WebKitGTK의 성능과 기능 격차가 알려진 위험이다 `[중간]`. 가상 스크롤과 드래그 앤 드롭, 키 이벤트(F키, 수정자 조합)는 M1부터 3개 OS에서 함께 확인한다.

## 6. 미확인 과제

| 항목 | 확인 방법 |
|---|---|
| specta 업스트림/fork 선택 | 스캐폴딩 때 `tauri-specta` 조합으로 타입 생성 시험 |
| ~~`@spacedrive/primitives`, `tokens`의 npm 게시와 버전, 라이선스~~ | 확인함(2026-10-01, 위 표) |
| Spacedrive의 린트/포맷/테스트 도구 | 루트 설정 파일 확인 |
| rar 처리 방식 | 라이선스와 크레이트 현황 조사 |
