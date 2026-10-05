# run — 미리보기에서 압축 파일 안의 파일 목록을 텍스트 트리로 보여 준다

워크플로우 없이 직접 실행했다. Rust 테스트 3개를 먼저 써서 빨간 상태를 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 `Service::preview`에 압축 파일 분기(`archive_preview`): 들여쓴 텍스트 트리, 2000줄 한도, 이름은 압축인데 못 열거나 512MiB 초과면 `other` — ✅ 계획대로
- S2 `PreviewDto` 변경·`gen-types` — ⚠ 필요 없었다. 기존 `text` 종류로 트리를 돌려주기 때문에 DTO·bindings·`backend.ts`·`tauri.ts`·`fake.ts`가 바뀌지 않았다
- S3 `Preview.tsx` 변경 — ⚠ 필요 없었다. 텍스트 미리보기가 들여쓰기를 이미 살려서 그대로 보인다. UI 테스트(2개)는 이 연결을 고정하는 회귀 방지로 추가했다

## 계획과 달라진 점
- DoD 2의 UI 테스트는 구현 전에도 통과했다(이미 맞는 동작을 고정하는 회귀 방지 검사). 전진 검사였던 건 Rust 쪽 DoD 1이다.
- 가짜 백엔드는 파일 내용을 그대로 텍스트로 돌려주므로 UI 테스트는 그 내용을 트리로 둔 것이다. 실제 트리 생성은 Rust 테스트가 검증한다.
- 크기 한도(512MiB)는 계획에 없던 방어다. tar 계열은 목록을 만들려면 전체를 훑어야 해서 큰 파일에서 미리보기가 멈추지 않게 했다.
- README의 미리보기 설명에 압축 파일 목록을 한 줄 추가했다.

## DoD baseline → after
1. `cargo test -p twin-deck-desktop preview_archive` — 0 tests → 3 passed (구현 전 3 failed)
2. `vitest -t "압축 파일 미리보기"` — 0 tests → 2 passed (구현 전에도 통과: 회귀 방지)
3. `up_to_date` 통과(DTO 변경 없음), clippy `-D warnings` 통과, tsc 통과. 전체 vitest 619 통과 / 1 실패(`pdf-preview` 기준선), Rust 34 통과

## 남은 불확실성
- 실제 앱에서 큰 압축(수백 MB zip, tar.gz)의 미리보기 속도는 측정하지 못했다.
- 항목 이름의 인코딩이 깨진 압축은 `td-archive`가 읽는 대로 보인다(별도 처리 없음).
