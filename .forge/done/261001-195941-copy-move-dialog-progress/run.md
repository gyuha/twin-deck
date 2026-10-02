# 실행 기록 — 복사/이동 확인 창과 진행 창

실행 방식: 워크플로우 없이 메인 세션에서 직접 실행 (조각 4개, 규모가 작아 비용상 직접 처리). TDD on — 조각마다 실패하는 테스트를 먼저 썼다. 브랜치 `feature/copy-move-dialog-progress`, 커밋은 하지 않았다.

## 조각별 결과
- S1 td-queue/td-ops 파일 단위 진행 집계 — ✅ 계획대로 (`Control::on_file_done`, `Ops::count_files`, `JobInfo.files_total/files_done`)
- S2 `JobDto`·bindings·fake·ts-client 테스트 — ✅ 계획대로 (`bindings.ts` 재생성)
- S3 전송 확인 창 — ⚠ 계획에 없던 판단 1건: `copy.to_inactive`/`move.to_inactive`는 문서(`docs/05`)상 "대화상자 없음"이라 확인 창을 거치지 않게 `copyOrMove(kind, confirm=false)`로 보존했다
- S4 전송 진행 창 — ✅ 계획대로 (`progress` 다이얼로그 종류를 추가해 Esc/Return 키 라우팅을 재사용)

## DoD (baseline → after)
1. `cargo test -p td-queue file_progress` — 테스트 없음 → 4개 통과 (전진 확인)
2. `bun run --cwd apps/desktop test -- transfer` — 파일 없음 → 12개 통과 (전진 확인)
3. `cargo test --workspace` — 통과 → 통과 (회귀 방지, 변화 없음)
4. `bun run test` — desktop 255 → 267 통과 (회귀 방지; F5/F6 기존 테스트에 Return 추가)
5. `bun run typecheck` — 0 → 0 (회귀 방지)
6. fmt/clippy — 0 → 0 (회귀 방지)
7. `cargo test -p twin-deck-desktop up_to_date` — 통과 → 통과 (회귀 방지, 필드 추가 후 bindings 재생성됨)
8. 실제 앱 UAT — 미실시 (시각 판단, 사용자 확인 필요)

## 계획 대비 차이·판단
- 기존 테스트 약 25개가 F5/F6 직후 Return이 없어 깨졌고, 계획대로 Return을 넣어 갱신했다. `core.copy.to_inactive`의 OP-10 테스트는 그대로 통과한다.
- 진행 창의 새 파란색/회색 유틸리티(`bg-neutral-200`)가 다크 테마 토큰에 없어 테마 가드가 깨져 `theme.css`에 `--color-neutral-200`을 추가했다.
- 같은 이유로 틀려진 `actions.ts` 주석과 `docs/m2-status.md`의 OP-10 줄을 고쳤다.
- 한계(비목표대로): 파일 하나가 매우 크면 그 파일이 끝날 때까지 막대가 멈춘다. 중단해도 이미 복사된 파일은 남는다.
- 파일 개수 집계는 작업 시작 시 재귀로 하므로 아주 큰 트리에서는 "집계 중…"이 잠시 보일 수 있다 (미측정).

## UAT 중 발견한 결함과 수정 (2026-10-01)
- 증상: 복사/이동이 끝나도 대상 패널에 파일이 보이지 않는다.
- 원인(재현으로 확인한 경합): `reload`에 순서 보호가 없어, 복사 중 시작한 느린 목록 조회가 마지막 조회보다 늦게 끝나면 옛 목록이 덮어썼다. 큐 시그니처에 `filesDone`을 넣어 조회 횟수가 늘어난 것이 경합 확률을 키웠다.
- 수정: 탭별 순번으로 오래된 응답을 버리고, 시그니처에서 `filesDone`을 뺐다.
- 회귀 방지: `transfer.test.tsx`의 "늦게 도착한 옛 목록이…" (수정 전 실패 → 후 통과). desktop 267 → 268 통과.
- 미확인: 실제 Tauri 앱에서의 확인은 아직이다.

## UAT 2차: 실제 앱에서 진행 창/갱신이 안 보임 (2026-10-01)
- 사용자 관찰: 파일이 실제로 복사되고(다른 폴더에 갔다 오면 보임), 콘솔 오류 없음, 배지/진행 창이 안 뜸. 폴더가 작으면 갱신되고 파일이 많으면 안 됨.
- 측정: 실제 `Service`로 3000개 파일 폴더를 복사하면 큐 이벤트 3006개가 약 0.45초에 쏟아졌다. 완료와 디렉터리 변경 이벤트는 정확히 나온다. 폴더/한글 이름/숨김 파일은 문제 없음(`queue_copies_folder_tree_and_reports_file_progress`).
- 추정 원인(확신도 중간, 웹뷰가 밀리는 것은 직접 보지 못함): `main.rs` 전달 스레드가 이벤트마다 전체 작업 목록을 웹뷰로 보내 수천 번의 알림이 몰린다.
- 수정: `service::coalesce`로 100ms마다 한 번만 스냅샷을 보낸다(마지막 이벤트 뒤에는 반드시 한 번 더 보낸다). 테스트 `coalesce_batches_a_burst_and_flushes_after_the_last_event`.
- 미확인: 실제 앱에서 해소됐는지.

## UAT 3차: 여전히 진행 창 없음, 완료 후 갱신 안 됨 (2026-10-01)
- 사용자 관찰: 이벤트 합치기(`coalesce`) 이후에도 같다. 다른 폴더에 갔다 오면 파일이 보인다.
- 확인: `docs/m1-status.md:42`에 "Rust 감시/큐 이벤트와 UI를 실제 Tauri 런타임으로 잇는 왕복은 테스트하지 않았다"고 적혀 있다. 즉 이벤트가 웹뷰에 닿는지는 한 번도 검증되지 않았고, 이 환경에서도 직접 확인할 수 없다. `coalesce`가 원인이라는 추정은 틀렸을 수 있다(수정 자체는 유지).
- 수정(이벤트에 의존하지 않기): `trackTransfer`가 전송이 끝날 때까지 100ms마다 `queueJobs()`를 직접 조회해 큐 상태를 반영하고, 300ms를 넘기면 진행 창을 띄우며, 끝나면 `reloadAll()`을 명시적으로 부른다. 이벤트가 오지 않는 상황을 만든 fake 테스트(`queueEvents=false`)를 추가했다(수정 전 실패 → 후 통과).
- 진단: 큐 이벤트를 처음 받으면 콘솔에 `[twin-deck] 큐 이벤트를 처음 받았습니다`를 한 번 찍는다. 이 줄이 안 보이면 실제 앱에서 이벤트가 오지 않는다는 증거다.
- 미확인: 실제 앱에서 해소됐는지, 이벤트가 정말 오지 않는지.

## UAT 4차: 복사 진행 창은 뜨지만 삭제에는 안 뜸 (2026-10-01)
- 사용자 관찰: 복사에서는 프로그레스가 보이기 시작했다(3차 폴링 수정 효과). 삭제에서는 여전히 안 보인다.
- 범위 변경: 원래 계획은 복사/이동만이었으나 사용자가 삭제에도 같은 창을 요청했다. 영구 삭제와 휴지통을 포함했다.
- 구현: `Ops::delete_with`(로컬은 파일 단위 순회, 아카이브 안은 파일마다 압축 파일을 다시 쓰게 되므로 기존처럼 한 번에), `Ops::delete_units`. 큐는 삭제의 분모를 파일 수로, 휴지통은 항목 수로 잡는다. UI는 `trackTransfer`를 삭제/휴지통에도 호출한다("삭제 중", "휴지통으로 이동 중").
- 한계: 휴지통은 OS 호출 한 번이 한 항목이라 항목 단위로만 진행된다. 아카이브 안 삭제는 1단계로 끝난다.
- 테스트: td-queue `file_progress_counts_deleted_tree`, `file_progress_counts_trashed_items`, UI "삭제 진행 창" 2개. desktop 269 → 271 통과.
- 미확인: 실제 앱.
