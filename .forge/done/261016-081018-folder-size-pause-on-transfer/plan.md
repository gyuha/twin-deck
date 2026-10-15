<!-- forge-slug: folder-size-pause-on-transfer -->
<!-- task: 177 -->
<!-- tdd: off -->
# 복사·이동이 시작되면 선택 폴더 용량 계산을 중단한다 (이슈 #81)

## 목표 / 하지 않을 것
- 목표: 옵션 `display.folder_size_on_select`가 켜져 있고 폴더 용량을 다 못 센 상태에서 복사·이동이 시작되면, 진행 중·대기 중 계산을 멈추고, 그 작업이 끝날 때까지 새 계산을 시작하지 않는다. 작업이 끝났는데 폴더가 아직 선택돼 있으면 다시 계산한다.
- 원인(추정 [중간]): `runTransfer`는 `clearSelection=true`(F5/F6 확인 경로)일 때만 선택을 비워 계산이 멈추지만, 드래그앤드롭·붙여넣기(`clearSelection=false`)와 반대편 패널의 선택은 그대로라 계산이 계속 돈다. 작업 중 목록이 다시 읽히거나 선택이 바뀌어도 `syncDirSizes`가 새 계산을 시작한다.
- 하지 않을 것:
  - Rust `dir_size`·`cancel_dir_size` 변경.
  - 옵션 이름·기본값·설정 화면 변경. 이미 계산이 끝난 크기를 지우는 것(숫자 결과는 그대로 둔다).
  - `trash`·`delete`·압축 같은 복사·이동이 아닌 작업에서 계산을 멈추는 것.
  - 버전·`CHANGELOG.md`·배포·push.

## 기준 문서
- 용어집: 없음. 관련 ADR: 없음.
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/folder-size-transfer.test.tsx`가 통과한다. 이 시험은 위 목표의 (a)진행 중 계산 취소 (b)대기 중 폴더 미시작 (c)작업 진행 중 새 선택에도 `dirSizeCalls` 증가 없음 (d)작업 종료 뒤 선택이 남아 있으면 재개 (e)`trash` 같은 비(非)복사·이동 작업은 멈추지 않음을 `FakeBackend`의 `dirSizeCalls`·`dirSizeDelayMs`로 단언한다. **빨강→초록**: 구현 전에 (a)(c)가 실패함을 한 번 확인하고 그 실패를 `run.md`에 적는다(작성 시점에는 파일이 없어 전부 실패).
  2. `bunx vitest run src/__tests__/folder-size-select.test.tsx src/__tests__/fake-dir-size.test.ts` 통과(작성 시점에도 통과하는 회귀 방어선).
  3. `cd apps/desktop && bunx vitest run` 전체와 `bunx tsc --noEmit`이 통과한다(회귀 방어선).
  4. `git diff --name-only ebdc43a -- crates apps/desktop/src-tauri packages/ts-client/src/generated | wc -l` → 0 (작성 시점 0, Rust·생성 파일을 건드리지 않았다는 회귀 방어선).

## 작업 쪼개기
- [ ] S1. `folder-size-transfer.test.tsx`를 먼저 쓴다. 복사·이동은 실제 경로(F5/F6 확인 또는 드래그앤드롭·붙여넣기)로 시작하고, 계산은 `dirSizeDelayMs`를 늘려 돌게 둔다. 작업 중 상태는 FakeBackend 큐(`kind`·`status`)로 만든다(필요하면 FakeBackend가 작업을 끝내지 않고 붙들어 두는 시험용 훅을 추가). — 완료 기준: DoD 1의 (a)~(e)를 모두 단언하고, 구현 전에 (a)(c)가 실패한다.
- [ ] S2. `store.ts`에서 `wantedDirSizes`가 "복사·이동 작업이 진행 중이거나 `runTransfer`가 실행 중이면 빈 목록"을 돌려주게 하고, `syncDirSizes`의 입력 기록에 그 상태를 더해 상태가 바뀔 때 다시 맞춘다. `runTransfer` 시작과 끝(`finally`)에서 계산 허용 여부를 갱신하고 끝에서 `syncDirSizes(get())`를 불러 재개한다. 이미 있는 취소 경로(`backend.cancelDirSize`)를 재사용한다. — 완료 기준: DoD 1~3 (depends: S1)
