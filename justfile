# just 미설치 환경에서는 각 타깃의 명령을 직접 실행한다.
setup:
    bun install
    rustup show

dev:
    bun run --cwd apps/desktop tauri dev

gen-types:
    @echo "타입 생성은 tauri-bridge 태스크에서 정의한다"

test:
    cargo test --workspace
    bun run test

check:
    cargo fmt --all --check
    cargo clippy --workspace --all-targets -- -D warnings
    bun run typecheck

fmt:
    cargo fmt --all

build:
    bun run build
    cargo build --workspace --release
