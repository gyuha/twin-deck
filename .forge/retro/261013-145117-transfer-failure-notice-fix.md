# 2026-10-13 — 복사·이동·삭제 작업이 빨리 실패하면 사용자에게 오류를 알린다 (UI, 적대적 리뷰 수정)

## Plan vs actual
- What went as planned: 수정 전 빨강 확인(5개 중 3개 실패), `trackTransfer`의 "진행 창 없이 끝나는" 분기에서 실패한 job을 알림으로 올림, `docs/07` 한 줄 추가. `bun run test` 전체(desktop 151 파일/1236 테스트)와 `tsc --noEmit` 통과.
- Divergences:
  - **`FakeBackend`에 실패 주입 수단이 없었다.** 항목이 실패하면 job이 `failed`가 되는 것은 이미 있었지만 임의 작업을 실패시킬 방법이 없어서 `nextJobError`(다음 작업 하나의 항목이 모두 이 문구로 실패)를 `symlinkError`와 같은 방식의 테스트 전용 필드로 추가했다. `Backend` 인터페이스는 그대로.
  - **테스트 셀렉터를 한 번 잘못 잡았다.** 진행 창 안의 오류 목록도 `role="alert"`라서 상태 표시줄 알림과 섞여 다섯 번째 테스트가 엉뚱한 이유로 실패했다. 다이얼로그 밖의 alert만 세도록 고쳤다.
  - **#142의 번역 대응표 누락이 여기서 발견됐다**(별도 회고 `ops-overwrite-safety-fix`에 기록).
  - 영어 문구가 `Deleting failed: …`처럼 어색하다. `verb`가 진행 창 제목용 현재진행형 문구를 재사용하기 때문이다. 고치려면 동사 키를 따로 만들어야 해서 범위 밖으로 뒀다.
- 고친 곳은 `trackTransfer` 한 곳이라 휴지통·삭제·복사·이동·압축·추출·미리보기 삭제를 한 번에 덮지만, 테스트는 휴지통과 복사만 직접 확인했다.

## Learnings
- Do differently next time:
  - 알림·오류를 검사하는 UI 테스트는 `role="alert"`가 상태 표시줄 알림 말고도 다이얼로그 안 오류 목록에 쓰인다는 점을 먼저 확인하고, 상태 표시줄 알림은 `closest('[role="dialog"]')`로 제외해서 센다(`transfer-failure-notice.test.tsx`의 `alertText`).
  - 변경 크기가 작아 보여도 마지막에 전체 vitest(`bun run test`)를 돌린다. 한 계획의 Rust 변경이 다른 계획의 UI 테스트에서 터졌다.
  - `FakeBackend`의 즉시 큐 모드는 "빨리 실패" 경쟁을 재현하지 못한다. 시간 의존 UI 동작은 수동 모드(`queueMode = "manual"` + `advance()`)로도 시험한다.
- **확인하지 못한 채 남은 것:** 실제 Tauri 런타임·WKWebView에서 알림이 보이는 모습, 실제 큐의 지연과 `FakeBackend`의 즉시 모드 차이, 사용자가 진행 창을 직접 닫은 뒤(`shownOnce`) 실패하는 경우의 알림, `queueJobs()` 예외를 삼키는 기존 `catch { return }`(이번에 그대로 둠).

## Doc updates
- CONTEXT.md promotion: none
- ADR added: none
