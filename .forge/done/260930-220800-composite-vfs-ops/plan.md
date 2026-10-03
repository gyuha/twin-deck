<!-- forge-slug: composite-vfs-ops -->
<!-- task: 36 -->
<!-- priority: high -->
<!-- tdd: off -->
# CompositeFs: 로컬과 아카이브를 같은 Vfs로 (복사/이동/삭제/큐/서비스 연결)

## Goal / Non-goals
- Goal: `Vfs` trait 뒤에서 경로에 따라 로컬(`LocalFs`)과 아카이브(`td-archive`)로 라우팅하는 `CompositeFs`. 로컬↔아카이브 사이 복사, 아카이브 안 삭제/이름 변경/mkdir, 아카이브 밖으로 이동, 폴더 재귀 복사가 기존 `td-ops`/`td-queue`/Tauri 서비스(list_dir, mkdir, touch, rename, detect_conflict, enqueue 등)에서 그대로 동작한다. 충돌 처리(덮어쓰기/건너뛰기/이름 바꿈)는 아카이브 안에서도 같다. `Vfs` trait에 `open_read`/`write_from` 같은 스트림 메서드를 더한다. 휴지통은 아카이브 안에서 지원하지 않는다(영구 삭제만, docs/08 §3.3).
- Non-goals: UI, 아카이브 안에서의 미리보기/정보(가능하면 read 기반으로 자동 동작하면 좋지만 요구는 아님).

## Source of truth
- Glossary terms: VFS, 큐
- Related ADRs: docs/adr/0005, 0012
- Definition of Done: `cargo test` 통과: `composite_copy_between_local_and_archive`(로컬 폴더 → zip 안, zip 안 → 로컬, 폴더 재귀, 충돌 3종, 아카이브 안 삭제/이름 변경/mkdir, 이동은 원본 삭제, 결과 zip은 시스템 `unzip -t` 통과), 기존 td-ops/td-queue/desktop 서비스 테스트 전부 유지. Tauri 서비스가 `아카이브.zip!/안` 경로로 `list_dir`/`enqueue_job`을 처리하는 서비스 단위 테스트. `bindings.ts` 갱신(필요 시).

## Work slices
- [ ] S1. Vfs trait 확장과 CompositeFs 라우팅 — completion criterion: 단위 테스트 통과
- [ ] S2. td-ops를 CompositeFs로 (복사/이동/삭제 크로스 fs) — completion criterion: `composite_copy_between_local_and_archive` 통과 (depends: S1)
- [ ] S3. 큐와 Tauri 서비스 연결 — completion criterion: 서비스 단위 테스트, `cargo test --workspace` 통과 (depends: S2)
