# just 미설치 환경에서는 각 타깃의 명령을 직접 실행한다.
setup:
    bun install
    rustup show

dev:
    bun run --cwd apps/desktop tauri dev

gen-types:
    UPDATE_BINDINGS=1 cargo test -p twin-deck-desktop bindings_are_up_to_date

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
