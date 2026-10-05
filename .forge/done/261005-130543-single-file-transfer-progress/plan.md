<!-- forge-slug: single-file-transfer-progress -->
<!-- task: 53 -->
<!-- tdd: on -->
# 전송 진행 창: 파일이 1개이면 그 파일의 바이트 진행률을 표시

## Goal / Non-goals
- Goal: 복사/이동에서 전체 파일 수(`filesTotal`)가 1이면 전송 진행 창의 막대를 그 파일의 바이트 비율로 채우고, 글자를 "12.3 MB / 80.0 MB"로 보여 준다. 파일이 여러 개이면 지금처럼 파일 개수 막대와 "N/M개"를 유지한다.
- Non-goals: 전송 속도·남은 시간 표시, 복사/이동 외 작업 종류(복제·압축·추출·삭제·휴지통), 같은 볼륨 이동(이름 바꾸기)의 바이트 진행, 큐 이벤트에 기대는 설계, `fs::copy`를 청크 루프로 바꾸는 것(OS 빠른 복사 경로 유지).
- 방침: 진행 바이트는 `fs::copy` 도중 약 100ms마다 대상 파일 크기를 읽어 얻는다. UI는 이미 전송 중 `queueJobs()`를 조회하므로 바이트 값도 같은 경로로 실어 보낸다.
- 이슈 추적: GitHub 이슈 #1

## Source of truth
- Glossary terms: 전송, 전송 진행 창, 바이트 진행률 (.forge/branch/feat/single-file-progress/CONTEXT.md)
- Related ADRs: none
- Definition of Done:
  1. `cargo test -p td-ops copy_reports_bytes` → `1 passed` 이상 (복사 중 알림이 단조 증가하고 마지막 값이 파일 크기와 같음). 작성 시점 pre-state: `0 tests`로 통과해 보이므로 반드시 "passed 개수 ≥ 1"까지 확인한다(없는 테스트가 초록으로 보이는 fail-open 방지). 전진 검사.
  2. `cargo test -p twin-deck-desktop job_bytes` → `1 passed` 이상 (복사 작업의 `queue_jobs`가 `bytesDone`/`bytesTotal`을 돌려줌). pre-state 동일, 전진 검사.
  3. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과. bindings.ts에 `bytesDone`/`bytesTotal`이 생긴다.
  4. `cd apps/desktop && bunx vitest run src/__tests__/transfer.test.tsx -t "바이트"` → 1개 이상 통과 (`filesTotal`이 1이면 "MB / MB" 글자, 2 이상이면 "N/M개" 유지). pre-state 동일, 전진 검사.
  5. `cargo clippy -p td-ops -p td-queue -p twin-deck-desktop -- -D warnings`와 `cd apps/desktop && bunx tsc --noEmit` 통과. 회귀 방지 검사로, 작업 전에도 통과한다.
  6. 실제 앱 확인(자동화 불가, 직접 확인): 격리 인스턴스에서 큰 파일 하나를 복사하면 막대가 점진적으로 차고 글자가 갱신된다. 파일 여러 개 복사는 기존과 같다.

## Work slices
- [ ] S1. `td-ops`: `Control`에 `on_bytes(done, total)`(기본 무동작)을 추가하고, `copy_entry`가 파일 복사 중 약 100ms마다 대상 크기를 읽어 알림 — completion criterion: 파일 하나 복사 시 알림이 단조 증가하고 마지막 값이 파일 크기와 같다(DoD 1)
- [ ] S2. 큐와 브리지: `JobInfo`/`JobDto`에 `bytesDone`/`bytesTotal`(Option) 추가, 큐의 Control이 `on_bytes`를 `JobInfo`에 반영, `task gen-types` — completion criterion: 복사 작업의 `queue_jobs`가 바이트 값을 돌려주고 `up_to_date` 통과(DoD 2, 3) (depends: S1)
- [ ] S3. ts-client: `backend.ts`·`tauri.ts`·`fake.ts`에 필드 반영, `FakeBackend`가 단일 파일 복사 중 바이트를 흉내 냄 — completion criterion: 타입 검사 통과, fake가 중간 바이트 값을 낸다(DoD 5) (depends: S2)
- [ ] S4. UI: `Dialog.tsx`에서 `filesTotal === 1`이고 바이트 정보가 있으면 막대를 바이트 비율로, 글자를 "12.3 MB / 80.0 MB"로 표시. 대상 크기를 모르면 기존 깜빡이는 막대 — completion criterion: DoD 4 통과 (depends: S3)
