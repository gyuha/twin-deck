# RUN — 폴더 트리가 활성 패널의 드라이브(SFTP·FTP·SMB 포함)를 따라 보인다 (이슈 #134)

## 작업 조각 결과
- S1 `FolderTree.tsx`의 뿌리를 활성 패널의 드라이브로 정하고 원격 경로를 표시 대상에 넣었다. 새 시험 6개를 먼저 써서 수정 전 컴포넌트에서 실패함을 확인한 뒤 구현했다 — ✅ as planned (시험 중 `node()` 헬퍼가 `\`를 CSS 이스케이프로 읽는 문제를 속성값 직접 비교로 고쳤다)
- S2 `docs/05`·`docs/06`·i18n ko/en의 `show_folder_tree.desc`를 새 동작에 맞췄다 — ✅ as planned

## 변경 요약
- `apps/desktop/src/ui/FolderTree.tsx`: `localPath` → `treePath`(원격 허용, 가상·압축 안만 제외), `driveRoot(path, volumes)` 추가(원격 `scheme://id/`, Windows 드라이브 문자는 `volumes` 없이 경로 조상 사슬의 맨 위, 로컬은 `volumeOf` 마운트 지점에 해당하는 조상). 뿌리는 활성 패널의 드라이브 하나(활성 패널이 가상·압축 안이면 마지막 뿌리 유지, 처음부터 그렇다면 기존 기본 뿌리). 같은 드라이브 안의 패널 위치만 `L`/`R` 표시·펼침 대상.
- `apps/desktop/src/__tests__/folder-tree.test.tsx`: 시험 6개 추가, `node()` 헬퍼를 속성값 비교로 변경.
- 문서·설명: `docs/05-actions-keybindings.md` `core.view.folder_tree` 줄, `docs/06-config-plugins.md` `show_folder_tree` 줄, `apps/desktop/src/i18n/ko.ts`·`en.ts`.

## DoD baseline → after
1. 새 시험 수(`grep -cE '✓.*(sftp|ftp://|SMB|활성 패널)'`): 0 → 6 (≥5) ✅ 전방 검사
2. 수정 전 컴포넌트(3906575)에서 새 시험 실패 수: 0 → 12 (≥4; 결과 요약과 목록에서 중복 집계됨) ✅ 전방 검사. red 실패 원인은 "노드 없음"/뿌리 aria-level 불일치(`expected null not to be null`, `aria-level … === "1"`)로 새 동작이 없어서였다. 복구 확인: `git diff --stat`에 수정본(34 insertions, 8 deletions)이 남아 있음.
3. 회귀: `bun run test` 196 files passed·1 skipped, 1656 → 1662 tests passed(새 6개), 종료 코드 0. `bun run typecheck` 5개 패키지 모두 0. 수정 전에도 통과한 회귀 보호 검사(기대한 결과).
4. 문서: `원격 탭은 표시하지 않는다` 1 → 0, `core.view.folder_tree` 줄의 `sftp` 0 → 1 ✅ 전방 검사.

## Rulings
- 작업 실행 방식: 워크플로 없이 이 세션에서 직접 실행 (단일 에이전트로 충분한 작은 변경이라 fg-run의 "작게 직접 처리" 권고를 따름, 스크립트 승인 대기 없이 무인 진행) — 권장 기본값 자동 선택.
- TDD: 플랜의 `tdd: off`(설정 기본값)를 따랐으나 S1은 플랜대로 새 시험을 먼저 쓰고 red를 확인했다.

## 한계(사실 그대로)
- 실제 SFTP/FTP 서버, Windows(`Z:\` 네트워크 드라이브), WKWebView 화면에서는 확인하지 못했다. 시험은 FakeBackend 기준이며 Windows 드라이브 시험은 가짜 FS가 `/` 경로만 다뤄서 `listDir`을 시험 안에서 덮어써 `Z:\…`에 응답하게 했다.
- Windows에서 SMB 폴더가 안 보이던 실제 원인은 코드만으로 확정하지 못했다(추정). 이 변경은 "뿌리를 경로에서 정한다"는 설계 변경이라 같은 증상을 없앨 가능성이 높지만 실제 환경 확인이 필요하다.
- 활성 패널이 압축 안·가상 탭이면 트리의 뿌리는 마지막 활성 드라이브 그대로이고 그 패널은 표시하지 않는다(비목표대로).
