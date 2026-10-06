# run — 선택한 폴더 용량 계산 (1/2): 백엔드 명령, 설정 키, 타입 연결

워크플로우 없이 직접 TDD로 실행했다. 슬라이스마다 테스트를 먼저 써서 빨간 상태(컴파일 실패 포함)를 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 `td-config`에 `display.folder_size_on_select`(기본 true) — ✅ 계획대로. 타입 오류 경고도 기존 검증이 처리해 추가 코드가 없었다
- S2 `Service::dir_size`/`cancel_dir_size`(+`dir_size_with`)와 `commands.rs` 래퍼 — ✅ 계획대로
- S3 `task gen-types`, `backend.ts`·`tauri.ts`·`fake.ts` 연결 — ✅ 계획대로

## 계획과 달라진 점
- `td-search`의 `CancelToken`에 `same_as`(같은 토큰인지 비교) 한 줄을 추가했다. 같은 경로로 새 계산이 이전 계산을 대체했을 때 이전 계산이 끝나며 새 계산의 등록을 지우지 않게 하려는 것이다.
- `dir_size`는 `#[tauri::command(async)]`로 만들었다. 기존 명령은 모두 동기 명령이라 메인 스레드에서 도는데, 폴더 용량은 수 초 걸릴 수 있어 UI가 멈추지 않게 스레드 풀에서 돌게 했다(`cancel_dir_size`는 즉시 끝나서 동기).
- 없는 경로와 폴더가 아닌 경로는 `disk_usage`가 빈 결과를 돌려줘 0이 되므로, 먼저 `stat`으로 검사해 오류로 돌려준다.
- 계산 규칙은 기존 `disk_usage`를 그대로 쓴다: 숨김 파일 포함, 하드 링크는 한 번, 심볼릭 링크는 따라가지 않음, 볼륨 경계는 넘지 않음.
- 실제 `LocalFs`의 심볼릭 링크·하드 링크 테스트는 unix에서만 돈다(`cfg(unix)`). Windows 코드는 컴파일만 확인된다.
- `FakeBackend`에는 테스트용 `dirSizeDelayMs`·`dirSizeCalls`를 더했다. 2/2의 UI 테스트가 취소·큐 순서를 시험하는 데 쓴다.

## DoD baseline → after
1. `cargo test -p twin-deck-desktop dir_size` — 0 tests → 6 passed (구현 전 컴파일 실패)
2. `task gen-types` 후 `up_to_date` 통과, `bindings.ts`에 `dirSize`·`cancelDirSize`·`folder_size_on_select` 생성(주의: 계획에는 `folderSizeOnSelect`라고 적었으나 설정 키는 snake_case로 생성된다)
3. `cargo test -p td-config` — 새 테스트 1개 포함 20 passed (구현 전 컴파일 실패)
4. `vitest -t "FakeBackend 폴더 용량"` — 0 → 4 passed (구현 전 `dirSize is not a function`으로 실패)
5. clippy `-D warnings`, `tsc`, `cargo fmt --check` 통과. 전체 vitest 651 통과 / 1 실패(`pdf-preview` 기준선), Rust 전부 통과

## 남은 불확실성
- 실제 앱(Tauri)에서 `command(async)`가 메인 스레드를 막지 않는지, 큰 폴더에서 취소가 즉시 먹는지는 확인하지 못했다.

## UAT 결과 (사용자)
실제 앱에서 동작을 확인했다("잘 동작 합니다", 2026-10-06).
