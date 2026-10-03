<!-- forge-slug: volbar-diskspace-backend -->
<!-- task: 11 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# 볼륨 남은 용량 조회 백엔드 (Rust · Tauri · TS 클라이언트)

## 목표 / 비목표
- 목표: 경로가 놓인 파일시스템의 남은 용량과 전체 용량을 알려 주는 `disk_space(path)`를 만든다.
  - `td-volumes`: `pub struct DiskSpace { pub free: u64, pub total: u64 }`, `pub fn disk_space(path: &str) -> Result<DiskSpace, String>`. unix는 `libc::statvfs`(`free = f_bavail * f_frsize`(일반 사용자가 쓸 수 있는 양), `total = f_blocks * f_frsize`), 그 밖의 OS는 "지원하지 않습니다" 오류. `libc` 의존성을 추가한다(이미 `Cargo.lock`에 전이 의존성으로 있다).
  - Tauri 명령 `disk_space(path: String) -> ServiceResult<DiskSpaceDto>`와 `DiskSpaceDto { free: f64, total: f64 }`(기존 크기 필드처럼 f64).
  - TS: `Backend.diskSpace(path): Promise<DiskSpaceDto>`, tauri 어댑터, `FakeBackend`(`diskSpaces: Record<마운트경로, {free,total}>`를 두고, 경로가 속한 볼륨을 **가장 긴 마운트 경로 접두**로 찾아 그 값을 돌려준다. 값이 없으면 `BackendError`).
- 비목표: UI, 스토어, 언마운트 동작 변경(이미 있다), 볼륨 목록에 용량 필드를 넣는 것.

## 기준 문서
- 용어집: 없음 · 관련 ADR: 없음
- 완료 정의(DoD): `.forge/branch/feat/volume-bar/loop.md`의 C4, C5 + C1·C2 회귀 없음.
  1. `cargo test -p td-volumes` 출력에 `disk_space_reports_total_and_free ... ok`, `disk_space_missing_path_is_error ... ok` (사전: 테스트 없음 → 전진 확인). 앞의 것은 `tempfile` 폴더에 **실제 statvfs를 호출**해 `0 < free <= total`을 단언한다(값을 흉내 내지 않는다). 뒤의 것은 없는 경로가 오류인지 본다.
  2. 바인딩/fixture 재생성(`UPDATE_BINDINGS=1 cargo test -p twin-deck-desktop up_to_date`) 후 환경 변수 없이 통과. `grep -c diskSpace packages/ts-client/src/generated/bindings.ts` ≥ 1 (사전 0).
  3. `Backend`·tauri 어댑터·`FakeBackend`에 `diskSpace`가 있고 `bun run typecheck` 0. `FakeBackend.diskSpaces`로 지정한 값이 가장 긴 접두 규칙으로 선택되는 것을 확인하는 vitest 단위 테스트가 `packages/ts-client/src/client.test.ts`에 추가돼 통과(`/Volumes/USB/a`는 USB 값, `/home`은 `/` 값, 값이 없는 경로는 거부).
  4. 회귀 방지(사전 통과 → 그대로): `cargo test --workspace` 0, `cargo fmt --all --check` 0, `cargo clippy -p td-volumes -p twin-deck-desktop -- -D warnings` 0, vitest 실패는 기존 pdf-preview 1건뿐.

## 작업 조각
- [ ] S1. `td-volumes::disk_space`와 위 두 테스트, `libc` 의존성 — 완료 기준: DoD 1.
- [ ] S2. Tauri 명령 `disk_space`, 바인딩 재생성, TS `Backend`/tauri/fake 구현과 단위 테스트 — 완료 기준: DoD 2, DoD 3. (depends: S1)
- [ ] S3. 전체 회귀·품질 확인 — 완료 기준: DoD 4. (depends: S2)
