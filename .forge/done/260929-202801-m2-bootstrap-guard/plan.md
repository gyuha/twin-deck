<!-- forge-slug: m2-bootstrap-guard -->
<!-- task: 23 -->
<!-- priority: high -->
<!-- tdd: off -->
# 앱 부팅 경로 분리와 부팅 회귀 방지

## Goal / Non-goals
- Goal: `main.tsx`의 시작 로직을 `bootstrap.tsx`의 `start(rootEl, deps)`로 분리해 Tauri IPC 모킹으로 테스트하고, capability가 플러그인 의존성을 덮는지 Rust 테스트로 검증한다. 빈 화면 회귀(코어 명령 권한 누락)를 기계로 막는 것이 목적이다.
- Non-goals: 새 기능.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0003
- Definition of Done: `bootstrap.test.tsx` 통과 — `@tauri-apps/api/mocks`의 `mockIPC`로 `plugin:path|resolve_directory` 등을 응답시켜 `start()`가 두 패널을 렌더, IPC가 오류를 돌려주면 `role=alert`로 "시작 실패" 문구 렌더. `capabilities_cover_plugins`(cargo test) 통과: capabilities에 `core:default` 존재, Cargo.toml의 `tauri-plugin-*`마다 권한 존재. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. `bootstrap.tsx`(`start`)와 얇은 `main.tsx` — completion criterion: bootstrap.test.tsx 통과
- [ ] S2. `capabilities_cover_plugins` Rust 테스트 — completion criterion: cargo test 통과 (플러그인이 없어도 core:default 검사는 수행)
