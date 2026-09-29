<!-- forge-slug: tauri-bridge -->
<!-- task: 6 -->
<!-- priority: medium -->
<!-- tdd: off -->
# Tauri 브리지: 파일 작업 command/event와 TS 클라이언트

## Goal / Non-goals
- Goal: `apps/desktop/src-tauri`에 in-process Tauri command(list_dir, mkdir, touch, copy, move, rename, trash, delete, watch/unwatch)와 event(디렉터리 변경)를 노출하고 `packages/ts-client`(`@twin-deck/ts-client`)에 타입 있는 호출 래퍼와 백엔드 포트 인터페이스를 둔다. 타입 생성은 specta/tauri-specta를 시도하고, 업스트림으로 동작하지 않으면 그 사실과 대안(수기 타입 + 드리프트 방지 테스트)을 `docs/adr`에 ADR로 기록한다.
- Non-goals: 큐 진행률 이벤트, 다중 창, 설정 로더.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0003, 0004
- Definition of Done: `cargo test --workspace`(명령 함수가 `td-vfs`/`td-ops`/`td-watch`에 위임되는 단위 테스트, tempdir 사용) 및 `bun run typecheck && bun run test`가 통과. ts-client의 백엔드 포트 인터페이스가 정의되어 UI 테스트가 인메모리 fake로 교체 가능. 타입 생성 방식(생성 or 수기+드리프트 테스트)이 결정되어 `docs/adr/`에 기록.

## Work slices
- [ ] S1. Rust command 함수들(위임 계층, Tauri 비의존 순수 함수로 분리해 테스트 가능하게) — completion criterion: tempdir 기반 테스트 통과
- [ ] S2. Tauri command/event 등록과 앱 상태(감시자 보유) — completion criterion: `cargo build --workspace` 통과 (depends: S1)
- [ ] S3. 타입 생성 시도 및 ADR — completion criterion: 결정이 ADR로 존재, 생성 타입/수기 타입이 TS에서 컴파일됨 (depends: S1)
- [ ] S4. `@twin-deck/ts-client` 래퍼 + 백엔드 포트 인터페이스 + fake 구현 — completion criterion: `bun run typecheck && bun run test` 통과 (depends: S3)
