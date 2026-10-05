# run — 전송 진행 창: 파일이 1개이면 바이트 진행률 표시

워크플로우 없이 직접 TDD로 실행했다(슬라이스 4개가 직렬 의존이고 작아서). 슬라이스마다 테스트를 먼저 쓰고 구현했다.

## 슬라이스 결과
- S1 `td-ops` 바이트 알림(`Control::bytes_sink`, 큰 파일은 100ms 폴링, 끝나면 (전체, 전체) 알림) — ✅ 계획대로, 단 알림 방식이 다름(아래)
- S2 큐·브리지(`JobInfo`/`JobDto`의 `bytesDone`/`bytesTotal`, bindings 재생성) — ⚠ `JobDto`의 `Eq` 파생을 뺌, 바이트는 `f64`
- S3 ts-client(`fake.ts`) — ✅ 필드 반영 + 테스트용 `reportBytes` 추가 (`backend.ts`/`tauri.ts`는 생성 타입을 그대로 써서 변경 없음)
- S4 UI(`Dialog.tsx`) — ⚠ 글자 형식에 `formatSize` 대신 `formatSpace` 사용

## 계획과 달라진 점
- 알림 방식: 계획은 `on_bytes(done, total)`를 `Control`에 직접 두는 것이었으나, 폴링 스레드에서 호출하려면 `Control: Sync`가 필요한데 기존 테스트의 `Control` 구현(`Cell` 사용)이 깨진다. 그래서 `bytes_sink() -> Option<Box<dyn Fn(u64, u64) + Send + '_>>`로 바꿨다. 기본값은 `None`이라 기존 구현에는 영향이 없고, `None`이면 스레드도 만들지 않는다.
- 1MiB 미만 파일은 폴링 스레드를 만들지 않고 끝날 때 한 번만 (전체, 전체)를 알린다. `park_timeout`/`unpark`로 복사가 끝나면 즉시 폴링을 멈춰, 파일마다 100ms씩 지연되지 않는다.
- `JobDto` 바이트는 기존 `size: f64`와 같은 관례로 `f64`(specta가 u64를 못 다룸). 그 때문에 `JobDto`에서 `Eq`를 뺐다(`PartialEq`만).
- `formatSize`는 소수점 없이 "12 MB"라서 합의한 "12.3 MB / 80.0 MB"가 안 나왔다. 항상 소수 한 자리인 `formatSpace`를 썼다.
- 바이트 값은 "지금 복사 중인 파일" 기준이라 파일이 여러 개면 파일마다 덮어쓴다. UI는 `filesTotal === 1`일 때만 쓴다.
- 폴링은 `std::fs::metadata(dest)`로 대상 크기를 읽는다. 아카이브 안으로 복사하는 경우 실제 경로가 없어 바이트 알림은 마지막 (전체, 전체)만 간다(미확인 가정, 아래 불확실성).

## DoD baseline → after
1. `cargo test -p td-ops copy_reports_bytes` — 0 tests → 2 passed (전진 검사 충족)
2. `cargo test -p twin-deck-desktop job_bytes` — 0 tests → 1 passed (전진 검사 충족). 큐 계층 테스트 `byte_progress_of_single_file_copy_ends_at_file_size`도 추가해 통과
3. `task gen-types` 후 `bindings_are_up_to_date`/`default_config_fixture_is_up_to_date` — 통과, bindings.ts에 `bytesDone`/`bytesTotal` 생성됨
4. `vitest transfer.test.tsx -t "바이트"` — 0 → 2 passed (전진 검사 충족)
5. `cargo clippy -p td-ops -p td-queue -p twin-deck-desktop -- -D warnings`, `bunx tsc --noEmit`, `cargo fmt --check` — 통과 → 통과 (회귀 방지 검사, 작업 전에도 통과)
   - 전체 vitest: 608 통과, 1 실패(`pdf-preview`, 이미 알려진 jsdom `Blob.text()` 기준선 잡음). 전체 Rust: td-ops 18+6, td-queue 15, twin-deck-desktop 31 통과.
6. 실제 앱 확인 — 아직 안 했다(자동화 불가, 사람이 확인). 격리 인스턴스에서 큰 파일 하나 복사 → 막대가 점진적으로 차는지.

## 남은 불확실성
- 폴링이 실제 앱에서 막대를 점진적으로 움직이는지는 테스트로 증명되지 않았다(테스트는 불변식만 확인: 단조 증가, 끝 값 = 파일 크기). 특히 이벤트 없이 UI의 `queueJobs()` 조회가 바이트 값을 가져오는 경로는 fake로만 검증됐다.
- APFS 복제처럼 순간에 끝나는 복사는 0%에서 바로 100%로 뛴다(의도한 동작).
- 아카이브 안으로 복사할 때의 바이트 폴링은 미검증.
- `docs/07-ui-spec.md`의 진행 창 설명은 갱신하지 않았다(계획 범위 밖). 필요하면 후속으로.

## 실제 볼륨 간 복사 검증 (프로브, 2026-10-05)
임시 HFS+ 디스크 이미지를 두 번째 볼륨으로 마운트해 600MB 파일을 `Ops::copy_with`로 복사했다(복제가 불가능한 실제 복사). 프로브 코드와 이미지는 확인 후 삭제했다.
- 0.73초 동안 알림 8번, 그중 중간 값 6번(9% → 17% → 35% → 52% → 64% → 83% → 100%), 약 100ms 간격, 단조 증가, 마지막 값 = 파일 크기.
- 같은 APFS 볼륨 안 복사는 복제로 0.6ms에 끝나 알림이 마지막 1번뿐이다(의도한 동작).
- 결론: 백엔드 폴링은 실제 파일 복사에서 점진적으로 동작한다. 아직 검증하지 못한 것은 이 값이 실제 앱(WKWebView)의 진행 창까지 닿아 막대가 움직이는지다(DoD 6의 UI 부분).

## UAT 결과
DoD 6(실제 앱 확인): 사용자가 실제 앱에서 동작을 확인했다(2026-10-05). → `verified: yes`.
