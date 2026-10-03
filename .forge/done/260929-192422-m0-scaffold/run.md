# RUN — M0 스캐폴딩

- S1 Cargo workspace/toolchain/justfile/.nvmrc/.gitignore/THIRD_PARTY_NOTICES — ✅ 계획대로 (`.cargo/config.toml`에 MSRV fallback 리졸버 추가)
- S2 Bun workspaces + apps/desktop (React 19, Vite 5, Tailwind v4, vitest) — ✅ 계획대로
- S3 src-tauri 크레이트 `twin-deck-desktop` — ⚠ rustc 1.88이라 tauri-utils 최신(1.90 요구) 불가 → `incompatible-rust-versions = "fallback"`로 호환 버전 해석, workspace rust-version 1.88로 상향. `crates/*` 글롭은 빈 디렉터리에서 실패해 명시적 멤버로 변경(크레이트 추가 시 멤버 등록 필요). build.rs가 dist 부재 시 빈 디렉터리를 만든다.
- S4 justfile — ✅ (just 미설치, 동일 명령을 직접 실행해 검증)

DoD baseline → after:
- cargo build --workspace: 없음 → exit 0
- cargo test/fmt/clippy: 없음 → exit 0
- bun typecheck/test/build: 없음 → exit 0, vitest 1 passed, dist/index.html 생성
