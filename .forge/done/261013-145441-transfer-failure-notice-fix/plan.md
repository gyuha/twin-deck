<!-- forge-slug: transfer-failure-notice-fix -->
<!-- task: 143 -->
<!-- generated-by: fg-adversarial-review -->
<!-- priority: medium -->
<!-- tdd: on -->
# 복사·이동·삭제 작업이 빨리 실패하면 사용자에게 오류를 알린다 (UI)

## 목표 / 비목표
- 목표: 진행 창이 뜨기 전에(삭제·휴지통은 300ms 지연, 복사·이동은 첫 조회 전에) 작업이 `failed`로 끝나면 지금은 `reloadAll()`만 하고 조용히 돌아간다. 이때 사용자에게 오류가 보이게 한다.
- 비목표: 충돌 다이얼로그 동작(Esc 부분 실행, 단일 문자 키, `ask()` 단일 슬롯), cut 클립보드 비우는 시점, 건너뛴 항목 집계, 큐 패널 개편, 백엔드 변경.

## 근거
- `apps/desktop/src/state/store.ts` `trackTransfer`(약 1098-1121행): 첫 조회에서 `!job || !isActiveJob(job)`이면 진행 창 없이 `reloadAll()` 후 `return`한다. `applyQueue`의 실패 표시는 진행 창이 이미 떠 있을 때만 남는다.
- 권한 없는 파일을 F8/Delete로 지우거나 읽기 전용 대상에 복사하면 목록이 그대로일 뿐 알림이 없고, 큐 팝업을 열어야 오류를 볼 수 있다.
- `FakeBackend`(`packages/ts-client/src/fake.ts`)의 기본 큐 모드는 `instant`라 이 경쟁이 테스트에서 재현되지 않는다.

## 원천(Source of truth)
- 용어: 없음
- 관련 ADR: 없음
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run` 전체 통과, `cd apps/desktop && bunx tsc --noEmit` 통과. (AGENTS.md 기준선: vitest는 전부 통과가 정상이다.)
  2. 새 vitest 테스트가 **수정 전 코드에서 빨강임을 먼저 실행해 확인한 기록이 `run.md`에 있고**, 수정 후 초록이다: 삭제(휴지통)와 복사가 각각 진행 창이 뜨기 전에 `failed`로 끝나는 상황에서, 사용자에게 보이는 알림(기존 `flash`/notice 메커니즘 중 이 저장소가 오류에 쓰는 것)에 실패 사유가 들어 있다. 알림 문구는 한국어다.
  3. 성공한 작업은 새 알림을 띄우지 않는다(테스트로 확인). 사용자가 닫아 둔 진행 창을 다시 띄우지 않는 기존 동작이 유지된다.
  4. 실패 상태가 한 번만 알려진다(같은 job을 `trackTransfer`가 두 번 알리지 않는다는 테스트 또는 근거를 `run.md`에 적는다).

## 작업 조각(Work slices)
- [ ] S1. 실패하는 작업을 만들 수 있게 `FakeBackend`에 오류 주입 수단이 있는지 확인한다. 없으면 가장 작은 형태(다음 enqueue를 지정한 오류로 끝내기)를 추가한다. 이때 `Backend` 인터페이스는 바꾸지 않고 `FakeBackend`의 테스트 전용 메서드로 둔다. — 완료 기준: 테스트에서 "다음 작업을 실패시킨다"를 한 줄로 쓸 수 있다.
- [ ] S2. 빨강 테스트를 먼저 작성하고 현재 코드에서 실패함을 확인한다(DoD 2·3). — 완료 기준: 실패 출력 요약이 `run.md`에 있다. (depends: S1)
- [ ] S3. `trackTransfer`가 진행 창 없이 끝나는 분기에서 종료된 job의 `status === "failed"`(또는 오류 목록이 비어 있지 않음)를 읽어 알림으로 올린다. `queueJobs()` 예외를 삼키는 `catch { return }`도 목록 갱신 없이 끝나지 않는지 확인하고, 그대로 두려면 이유를 `run.md`에 적는다. — 완료 기준: DoD 1~4 충족. (depends: S2)
- [ ] S4. `docs/`의 해당 동작 설명이 있으면(`grep -rn "진행 창\|진행 다이얼로그" docs/*.md`) 한 줄 맞춘다. 없으면 `run.md`에 "없음"이라 적는다. — 완료 기준: grep 결과와 처리 결과가 `run.md`에 있다. (depends: S3)

## 메모
- `isActiveJob` 의미와 `applyQueue`의 알림 경로를 먼저 읽고, 이미 알리는 경로가 있으면 새 경로를 만들지 말고 그 경로에 합친다.
- 실제 WKWebView·Tauri 런타임에서의 표시는 테스트가 덮지 못한다. 눈으로 확인하지 못했으면 `run.md`에 "미검증"으로 적고 단정하지 않는다.
