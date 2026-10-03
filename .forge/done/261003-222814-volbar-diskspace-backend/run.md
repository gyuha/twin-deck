# RUN — 볼륨 남은 용량 조회 백엔드 (volbar-diskspace-backend)

실행 방식: 메인 세션에서 직접 실행(Dynamic Workflow 없음, `running.md` 없음).

## 슬라이스별 결과
- S1 `td-volumes::disk_space` + 테스트 2종 + `libc` 의존성 — ✅ 계획대로. `statvfs` 필드 타입이 OS마다 달라(`f_bavail`은 macOS에서 u32) 캐스트가 필요하고, clippy는 한쪽에서 불필요한 캐스트라고 지적해서 이유를 주석으로 적고 `allow(clippy::unnecessary_cast)`을 붙였다. 테스트는 모듈 안(`space::tests`)에 뒀다
- S2 Tauri 명령 `disk_space`, 바인딩 재생성, TS `Backend`/tauri/fake 구현 + 단위 테스트 — ✅ 계획대로 (`DiskSpaceDto`는 `index.ts`에서도 내보냄)
- S3 전체 회귀·품질 확인 — ⚠ 첫 실행에서 `coalesce_batches_a_burst_and_flushes_after_the_last_event`가 실패했다(타이밍에 의존하는 기존 테스트, 이번 변경과 무관). 같은 테스트 단독 3회와 `cargo test --workspace` 재실행에서 통과. 이 테스트는 컴파일 직후 병렬 부하에서 가끔 실패하는 불안정한 테스트로 보인다(별도 확인이 필요하면 이후 작업)

## DoD baseline → after
1. `cargo test -p td-volumes`: 테스트 없음 → `disk_space_reports_total_and_free ... ok`, `disk_space_missing_path_is_error ... ok` (전진). 앞의 것은 임시 폴더에 실제 statvfs 호출 후 `0 < free <= total` 단언.
2. `grep -c diskSpace bindings.ts`: 0 → 1, 환경 변수 없이 `up_to_date` 통과.
3. `Backend`·tauri·fake에 `diskSpace`, `bun run typecheck` 0, ts-client vitest 45 passed(새 테스트: 가장 긴 접두·경계(`/Volumes/USB2`가 `/Volumes/USB`로 오인되지 않음)·값 없으면 거부).
4. 회귀 방지(사전 통과 → 그대로): cargo test --workspace 0, fmt 0, clippy(-p td-volumes -p twin-deck-desktop) 0, vitest 449 passed·실패는 기존 pdf-preview 1건.
