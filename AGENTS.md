# AGENTS.md

This file provides guidance to coding agents (Codex, Claude Code, and others) when working with code in this repository. `CLAUDE.md` imports it, so keep the shared guidance here.

Twin Deck is a keyboard-driven dual-pane file manager (Tauri 2 + Rust core + React 19 UI, Bun workspaces). UI text, docs, comments, and test names are written in Korean; match that. README.md and `docs/` (00-overview … 11-roadmap, `docs/adr/`) hold the product spec; `docs/05-actions-keybindings.md` is the action/key catalog and should be updated when actions or default keys change.

## Commands

Task runner is go-task (`Taskfile.yml`; `justfile` is an older mirror). Plain commands work too.

```sh
task setup            # bun install + rustup show
task dev              # tauri dev (Vite on :1420 strictPort + Rust)
task test             # cargo test --workspace && bun run test
task check            # fmt --check, clippy --all-targets -D warnings, typecheck
task gen-types        # regenerate TS bindings + default-config.json (see below)
task bundle           # macOS .app / Windows NSIS installer
task install          # bundle + install to /Applications (macOS) / NSIS silent (Windows)
task release:draft    # upload this OS's bundle to a private draft GitHub release (no tag)
task release          # same, then publish — only if both macOS and Windows assets are present
```

Single tests:

```sh
cargo test -p td-ops copy_dir                       # one crate / name filter
cargo test -p twin-deck-desktop preview_cbz         # service tests live in apps/desktop/src-tauri/src/service.rs
cd apps/desktop && bunx vitest run src/__tests__/drag-drop.test.tsx -t "이동"
cd apps/desktop && bunx tsc --noEmit
```

Known baseline noise (not caused by your change): vitest `pdf-preview` fails (jsdom `Blob` has no `.text()`); `service::tests::coalesce_*` is timing-sensitive and can fail in a parallel `cargo test --workspace` but passes alone; `cargo clippy --all-targets` fails on an old `root.clone()` in `service.rs` tests, so use `cargo clippy -p <crate> -- -D warnings` as the real gate.

Release/version: bump `version` in `apps/desktop/src-tauri/tauri.conf.json` **and** `apps/desktop/src-tauri/Cargo.toml` (+ Cargo.lock). `scripts/release.{sh,ps1}` take `draft|publish`; `DRY_RUN=1` skips repo-state checks and only prints mutating `gh` calls. Builds are unsigned (README documents the Gatekeeper workaround).

## Architecture

**Rust workspace (`crates/`)** — layered, lower crates don't know upper ones: `td-vfs` (Vfs trait, `LocalFs`, preview reading) → `td-archive` (zip/tar as folders, `CompositeFs` that routes `foo.zip!/inner` paths) → `td-ops` (copy/move/delete with `Control` trait for progress/abort/error collection) → `td-queue` (background job worker, `JobInfo`, events). Also `td-config` (TOML default+user merge, validation, file watch, `set_user_value`), `td-search`, `td-volumes`, `td-watch`, `td-state`, `td-launch`.

**Bridge** — `apps/desktop/src-tauri`: `service.rs` holds `Service<T: Trasher>` (owns ops, queue, watcher, searches, file clipboard) and is what tests exercise; `commands.rs` exposes thin `#[tauri::command] #[specta::specta]` wrappers registered in the command list. tauri-specta generates `packages/ts-client/src/generated/bindings.ts`; `default-config.json` is generated from `default.toml`. A test (`up_to_date`) fails if either is stale → run `task gen-types` after changing any `Type`-derived struct/enum or command signature.

**ts-client** — `Backend` interface (`packages/ts-client/src/backend.ts`) with two implementations: `TauriBackend` (invokes commands) and `FakeBackend` (`fake.ts`, in-memory FS/queue/config used by every vitest). Adding a backend capability means touching: Rust command → regen bindings → `backend.ts` → `tauri.ts` → `fake.ts`.

**UI (`apps/desktop/src`)** — one vanilla zustand store (`state/store.ts`) with a large `api` object; components read via `useApp`/`useAppStore`. Key mechanics:
- Actions/keys: action metadata + default bindings in `packages/actions/src/defaults.ts` (scopes: pane, preview, dialog, find, quickSelect, panel, global …), handlers wired in `apps/desktop/src/actions.ts`, key resolution/dispatch in `ui/useKeyboard.ts` (dialogs get special-cased keys there). `fkey-bindings.test.tsx` enumerates default F-key bindings and must be updated when one is added.
- Dialogs use promise-based `ask()` in the store; copy/move/paste/drop all funnel through `runTransfer` (conflict dialog, queue enqueue, progress dialog via `trackTransfer`).
- Config key checklist: `td-config` struct + `default.toml` → `task gen-types` → `ui/Settings.tsx` `SECTIONS` (keyed by dotted path) → settings tab-list test.
- Drag & drop is **custom pointer-event drag** (`ui/DragLayer.tsx`, `drag` state in the store), not HTML5 DnD: the webview can't report Ctrl during native drags and the OS draws the cursor badge. When the pointer leaves the window it hands off to `start_native_drag` (the `drag` crate) so files can be dropped on Finder/Explorer. `tauri.conf.json` sets `acceptFirstMouse` so an inactive window receives the first press.
- Preview (`ui/Preview.tsx`): text/code/markdown/json/image/pdf/audio/video/cbz. Audio uses data-URL→Blob; video streams through the Tauri asset protocol (`Backend.fileUrl`); PDF paging uses `#page=N` because the WKWebView viewer can't be scrolled from JS.

## Platform gotchas

- macOS filenames are NFD on disk/SMB but the UI uses NFC. `td-vfs/src/local.rs` retries failed stat/create/copy/rename/remove with an NFD path (`retry_nfd`); SMB shares return "not found" for NFC paths, which previously broke copy and conflict detection. Keep that when adding new `LocalFs` operations.
- Windows and Linux code paths exist (`cfg(windows)`) but are only compile-verified from macOS.

## Verifying in the real app

Tests don't cover WKWebView behavior (drag, media, scrolling). To check the real UI, run an isolated instance (`HOME=/tmp/td-iso target/debug/twin-deck-desktop` with a pre-written `state.json`/`config.toml` under `~/Library/Application Support/dev.twindeck.app`; it loads the frontend from the Vite dev server). Send keys/mouse only to that instance's pid — the user's own `tauri dev` app has the same executable name, so never select processes by name.

## Workflow notes

- `.forge/` holds the forge-plugin loop state (plans, done archives, `config.json` with `driveCommit`); `.forge/loop.md` and `drive.md` are gitignored volatile state.
- Commit messages in this repo are Korean and end with the `Co-Authored-By` trailer.
