# LOOP — 열린 GitHub 이슈 #13(폴더 심볼릭 링크로 이동 불가)을 수정한다 (구현 + 테스트 + 커밋·푸시·이슈 닫기)
started: 2026-10-06
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-06T00:00:00Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. (#13 Rust) `cargo test -p twin-deck-desktop link_is_dir` 통과 ≥ 1, 실패 0. 폴더 링크는 `linkIsDir` true, 파일 링크·끊어진 링크·일반 폴더·일반 파일은 false.
- [ ] C2. (#13 타입) `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과, `grep -c linkIsDir packages/ts-client/src/generated/bindings.ts` ≥ 1.
- [ ] C3. (#13 UI) `cd apps/desktop && bunx vitest run src/__tests__ -t "폴더 심볼릭 링크"` 통과 ≥ 1, 실패 0. 폴더 링크는 `Enter`·더블클릭·오른쪽 클릭 "열기"·`→`로 링크 경로로 들어가고, 파일 링크와 끊어진 링크는 들어가지 않으며, 일반 폴더는 그대로다.
- [ ] C4. 회귀 방지: `bunx tsc --noEmit` 통과, 전체 `bunx vitest run`의 실패는 기준선 `pdf-preview` 1건뿐, `cargo test -p twin-deck-desktop` 통과, `cargo clippy -p twin-deck-desktop -- -D warnings` 통과, `cargo fmt --check` 통과.

## Check progress (updated after EVERY stop-condition run)
- C1: not-run
- C2: not-run
- C3: not-run
- C4: not-run

## Authorized replan scope
- 실패한 조건에 직접 연결된 수정 작업만 자동 생성한다.
- 사용자 결정(2026-10-06): 폴더 링크에 들어갈 때 경로는 링크 경로 그대로. 파일을 가리키는 링크는 이번 범위 밖(남은 한계로 알림). 복사·삭제 등 파일 작업의 링크 처리는 바꾸지 않는다.
- 사전 승인된 외부 쓰기(목표 달성 시 한 번): 작업 브랜치 `fix/issue-13-folder-symlink`의 커밋, 그 브랜치의 일반 푸시(강제 푸시 금지), 이슈 #13(작성자 mordol)에 결과 코멘트 후 닫기. 그 밖의 외부 쓰기는 모두 안전 벽이다.
- always-halt action classes (default set): prod data mutation/deletion · deploy/release/publish · outbound external comms (위의 사전 승인 항목은 제외) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 제외: `main`에 직접 커밋·푸시, 병합, 릴리스·태그.
- 실제 앱(macOS iCloud CloudDocs 같은 링크)에서의 동작은 기계로 검증하지 않는다. 사용자가 확인 전 이슈가 닫히는 점은 사전 승인했다.

## Tasks
- folder-symlink-enter
