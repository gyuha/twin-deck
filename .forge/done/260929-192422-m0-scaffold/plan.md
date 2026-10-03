<!-- forge-slug: m0-scaffold -->
<!-- task: 15 -->
<!-- priority: high -->
<!-- tdd: off -->
# M0 스캐폴딩: 워크스페이스 + Tauri 2/React 19 최소 앱

## Goal / Non-goals
- Goal: docs/10-dev-setup.md §1·§3·§8 구조대로 Cargo/Bun 모노레포와 최소 Tauri 2 + React 19 + Vite + Tailwind v4 앱을 만들고 typecheck/test/build 명령이 도는 상태로 만든다.
- Non-goals: Spacedrive 코드 이식(자체 구현 결정, 크레이트는 이후 태스크), CI 파이프라인 파일 실행/검증, specta 업스트림 결정 문서화 이상의 작업, 패키징.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0001, 0002, 0003, 0009
- Definition of Done: 루트 `Cargo.toml`(workspace, resolver 2), `package.json`(Bun workspaces: apps/*, packages/*), `rust-toolchain.toml`, `.nvmrc`(20.18), `justfile`(setup/dev/gen-types/test/check/fmt/build), `.gitignore`, `THIRD_PARTY_NOTICES.md`(이식 코드 없음을 명시), `apps/desktop`(src + src-tauri, crate 이름 `twin-deck-desktop`), 루트 scripts `typecheck`/`test`/`build`가 `bun run <name>`으로 동작. `cargo build --workspace`, `cargo test --workspace`, `bun run typecheck && bun run test && bun run build`가 종료코드 0. vitest 스모크 테스트 1개 이상(앱 렌더). `crates/`에는 아직 빈 자리 없이 필요한 것만.

## Work slices
- [ ] S1. Cargo workspace + toolchain + justfile + .nvmrc + .gitignore + THIRD_PARTY_NOTICES.md — completion criterion: `cargo metadata` 성공, 파일들 존재
- [ ] S2. Bun workspaces + apps/desktop (Vite + React 19 + Tailwind v4 + vitest + Testing Library) + scripts — completion criterion: `bun install && bun run typecheck && bun run test && bun run build` 종료코드 0, `apps/desktop/dist/index.html` 생성 (depends: S1)
- [ ] S3. src-tauri 크레이트(Tauri 2, `twin-deck-desktop`)를 workspace에 편입, 빈 창이 뜨는 최소 구성 — completion criterion: `cargo build --workspace` 및 `cargo test --workspace` 종료코드 0 (depends: S1, S2)
- [ ] S4. `justfile`이 위 명령을 감싸도록 정리(`just`가 로컬에 없으므로 실행 검증은 동일 명령을 직접 실행) — completion criterion: justfile 타깃이 실제 존재하는 명령만 호출
