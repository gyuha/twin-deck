# LOOP — 폴더 트리가 활성 패널의 드라이브(SFTP·FTP·SMB 포함)를 따라 보인다 (이슈 #134)
started: 2026-10-26
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-26T02:07:08Z
wall: none

## Stop-condition checks (ALL must pass)
기준 커밋: 3906575 (수정 전). 모든 명령은 저장소 루트에서 실행하고 `cd`는 그 명령 안에서만 쓴다.
- [ ] C1. 새 동작 시험이 통과한다: `cd apps/desktop && bunx vitest run src/__tests__/folder-tree.test.tsx --reporter=verbose` 종료 코드 0 이고 `… 2>&1 | grep -cE '✓.*(sftp|ftp://|SMB|활성 패널)'` ≥ 5. (시험 제목에 sftp·ftp://·SMB(마운트/Windows 드라이브)·활성 패널이 들어가고, 뿌리 노드 `data-tree-path`·`L`/`R` 표시·하위 폴더 노드·노드 클릭 이동·활성 패널 전환 시 뿌리 교체를 단언한다 — 단언 내용은 플랜 DoD 1 참고. 수정 전 값: 0)
- [ ] C2. 새 시험이 정말 새 동작을 검사한다(red → green, 시험이 항상 통과하는 가짜 방지): `cd apps/desktop && cp src/ui/FolderTree.tsx /tmp/FolderTree.fixed.tsx && git show 3906575:apps/desktop/src/ui/FolderTree.tsx > src/ui/FolderTree.tsx; out=$(bunx vitest run src/__tests__/folder-tree.test.tsx --reporter=verbose 2>&1); cp /tmp/FolderTree.fixed.tsx src/ui/FolderTree.tsx; echo "$out" | grep -cE '(×|FAIL).*(sftp|ftp://|SMB|활성 패널)'` ≥ 4 이고 이어서 `git diff --stat -- apps/desktop/src/ui/FolderTree.tsx` 가 수정본(비어 있지 않음, 또는 이미 커밋됐다면 `git status --short`가 깨끗)임을 확인한다. (수정 전 값: 0 — 명령이 실제로 실행됨을 확인함)
- [ ] C3. 회귀 없음 — 전체 시험: 저장소 루트 `bun run test` 종료 코드 0 (수정 전 기준: 196개 파일 통과·1개 건너뜀, 1656개 시험 통과). 기존 `folder-tree.test.tsx` 13개 시험도 그대로 통과한다.
- [ ] C4. 회귀 없음 — 타입: 저장소 루트 `bun run typecheck` 종료 코드 0 (수정 전 기준: 5개 패키지 모두 0).
- [ ] C5. 문서가 새 동작과 맞다: `! grep -q "원격 탭은 표시하지 않는다" docs/05-actions-keybindings.md && grep "core.view.folder_tree" docs/05-actions-keybindings.md | grep -q "sftp"` 성공. 그리고 `docs/06-config-plugins.md`의 `show_folder_tree` 줄이 "로컬만"이라는 낡은 설명을 담지 않는다. (수정 전: `원격 탭은 표시하지 않는다` 1건·`sftp` 0건)

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: fail ×0 · regressed: ×0 · last-evidence: "(아직 실행 전) 수정 전 값 0" · tried:
- C2: fail ×0 · regressed: ×0 · last-evidence: "(아직 실행 전) 수정 전 값 0" · tried:
- C3: pass ×0 · regressed: ×0 · last-evidence: "bun run test → 196 files passed | 1 skipped, 1656 tests passed (수정 전, 2026-10-26)" · tried:
- C4: pass ×0 · regressed: ×0 · last-evidence: "bun run typecheck → 5 packages exited 0 (수정 전, 2026-10-26)" · tried:
- C5: fail ×0 · regressed: ×0 · last-evidence: "(아직 실행 전) 수정 전: '원격 탭은 표시하지 않는다' 1건, sftp 0건" · tried:

## Authorized replan scope
- 실패한 체크에 직접 이어지는 보정 작업만. 바꿀 수 있는 곳: `apps/desktop/src/ui/FolderTree.tsx`, 필요하면 `apps/desktop/src/state/store.ts`·`apps/desktop/src/lib/`(뿌리 계산 보조 함수), `apps/desktop/src/__tests__/folder-tree*.test.tsx`, `apps/desktop/src/__tests__/helpers.tsx`, `packages/ts-client/src/fake.ts`(시험용 FakeBackend 보강이 꼭 필요할 때만), `docs/05-actions-keybindings.md`, `docs/06-config-plugins.md`, `apps/desktop/src/i18n/ko.ts`·`en.ts`의 `show_folder_tree.desc`.
- 범위 밖(필요해지면 fork 벽): Rust 코드(`crates/`, `apps/desktop/src-tauri`)·생성된 타입(`bindings.ts`)·`Backend` 인터페이스 변경, 새 설정 키·액션, 버전 올리기·CHANGELOG·릴리스, 기존 시험의 기대값을 약하게 고치기.
- always-halt action classes (safety wall — default set, override/extend per loop): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 상태 루트: 이 루프는 브랜치 `fix/folder-tree-active-drive-134`에서 돌아서 forge 상태는 `.forge/branch/fix/folder-tree-active-drive-134/`에 있다(기본 브랜치에서 시작해 옮겼다).
- 추가 제외: `git push`, PR 생성, 이슈 댓글(이 루프는 로컬 작업과 커밋까지만 한다. `driveCommit`이 켜져 있어 봉인마다 로컬 커밋은 한다).
- 알려진 한계(사실 그대로): 실제 SFTP/FTP 서버, Windows(`Z:\` 네트워크 드라이브), WKWebView 화면은 이 환경에서 확인할 수 없다. 모든 체크는 FakeBackend 기준이며 "실제 앱에서 보인다"는 이 루프의 완료 조건이 아니다. SMB가 Windows에서 안 보이던 실제 원인은 코드만으로 확정하지 못했다(추정).

## Tasks
- folder-tree-follows-active-drive
