# run — 압축을 푸는 동안 진행 창을 띄워 N/M개로 진행을 보여 준다

워크플로우 없이 직접 실행했다. 테스트(Rust 1개, vitest 1개)를 먼저 써서 빨간 상태를 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 큐가 추출 작업의 `files_total`을 아카이브 안 파일 수로 채우고 파일마다 `files_done`을 올린다 — ✅ 계획대로
- S2 `store.ts`의 `extract`가 작업마다 `trackTransfer(jobId, "압축 풀기")`로 진행 창을 띄운다(`FakeBackend`도 추출의 `filesTotal`을 채운다) — ✅ 계획대로

## 계획과 달라진 점
- 분모는 `Ops::count_archive_files`(폴더 제외 파일 수)로 작업 시작 때 한 번 센다. 압축 파일의 목차를 한 번 더 열어서 읽는다(추출 때 한 번, 세기 때 한 번). 큰 압축에서는 목차를 두 번 읽는 비용이 있다.
- 아카이브를 여는 방식(확장자 → 내용 판별)을 `open_archive_for_extract`로 빼서 세기와 추출이 같은 방식으로 열게 했다.
- 진행은 `extract_all_with`가 항목 처리 직전에 부르는 콜백에서 "앞서 처리한 파일이 끝났다"를 알리는 방식이라 마지막 파일은 추출이 끝난 뒤 한 번 더 알린다.
- 가짜 백엔드의 추출 진행은 수동 모드에서 아카이브 하나가 끝나면 그 안의 파일 수만큼 한꺼번에 오른다(중간 값 없음). 중간 진행은 Rust 테스트가 검증한다.
- 바이트 진행률과 실제 앱 화면은 범위 밖이다.

## DoD baseline → after
1. `cargo test -p td-queue extract_reports_file_progress` — 0 tests → 1 passed (구현 전 `(None, 0)`으로 실패)
2. `vitest -t "압축 풀기 진행 창"` — 0 tests → 1 passed (구현 전 실패)
3. `up_to_date`·clippy·tsc 통과(DTO 변경 없음). 전체 vitest 629 통과 / 1 실패(`pdf-preview` 기준선), Rust 전부 통과

## 남은 불확실성
- 실제 앱에서 추출 진행 창이 뜨고 N/M개가 오르는지는 직접 확인하지 못했다.
