# 실행 기록 — 복사·이동이 시작되면 선택 폴더 용량 계산을 중단한다 (task #177)

## 슬라이스 결과
- S1 `folder-size-transfer.test.tsx` 먼저 작성 — ✅ 계획대로. 다만 (c)를 붙여넣기 UI로 만들면 붙여넣기 뒤 `Insert`가 왼쪽 패널에서 선택되지 않아(원인 미확인) FakeBackend `enqueue("copy"|"move")`로 진행 중 작업을 직접 만들어 시험했다. (a)(b)는 실제 `Ctrl+C`→`Tab`→`Ctrl+V` 붙여넣기 경로다.
- S2 `store.ts`: `transfersStarting`+`transferBusy(s)`(진행 중·대기 중 copy/move 작업 또는 `runTransfer` 실행 중), `wantedDirSizes`가 그동안 빈 목록, `syncDirSizes` 입력 기록에 `transferBusy` 추가, `runTransfer`를 `transfersStarting` 증감과 `syncDirSizes`로 감싼 래퍼(`runTransferNow`가 본체) — ✅ 계획대로. 기존 취소 경로(`backend.cancelDirSize`)를 그대로 쓴다.

## 계획과 달라진 점
- ⚠ 시험 (d)는 "계산 대상이 sub뿐"으로 단언한다. 작업이 끝나 목록이 다시 읽히면 끝난 크기가 지워져 한 번 더 세는 것은 기존 동작이라 정확히 1회로 못 박지 않았다.
- ⚠ 원인 추정: F5/F6 확인 경로는 `clearSelection=true`라 선택이 비워져 계산이 이미 멈췄다. 붙여넣기·드래그앤드롭(`clearSelection=false`)과 반대편 패널의 선택은 그대로라 계산이 계속 돌았다. 이슈 보고자의 실제 경로를 재현하지는 못했다. 실제 앱에서 확인하지 못했다.

## DoD baseline → after
1. `folder-size-transfer.test.tsx`: 구현 전(store.ts 원본) 5개 중 4개 실패(진행 중 취소·대기 폴더·작업 중 새 선택·이동), (e)휴지통은 통과 → 구현 후 5/5 통과 (빨강→초록)
2. `folder-size-select.test.tsx`+`fake-dir-size.test.ts`: 14 passed → 14 passed (회귀 방어선)
3. vitest 전체 162 files / 1378 passed, `tsc --noEmit` 0 (회귀 방어선)
4. Rust·생성 파일 변경 수: 0 → 0
