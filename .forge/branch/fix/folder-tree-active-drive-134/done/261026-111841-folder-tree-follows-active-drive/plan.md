<!-- forge-slug: folder-tree-follows-active-drive -->
<!-- task: 207 -->
<!-- tdd: off -->
# 폴더 트리가 활성 패널의 드라이브(SFTP·FTP·SMB 포함)를 따라 보인다 (이슈 #134)

## 목표 / 비목표
- 목표: 폴더 트리(`behavior.layout.show_folder_tree`)의 뿌리를 **활성 패널이 있는 드라이브 하나**로 정한다. 활성 패널이 `sftp://<id>/…`면 뿌리는 `sftp://<id>/`, `ftp://<id>/…`면 `ftp://<id>/`, Windows 경로(`Z:\…`)면 그 드라이브 문자(`Z:\`)—SMB로 연결한 네트워크 드라이브가 `volumes` 목록에 없어도 경로만으로 정한다—, macOS·Linux 로컬이면 그 경로가 속한 볼륨의 마운트 지점(`volumeOf`, SMB 마운트 `/Volumes/<공유>` 포함, 어느 볼륨에도 안 속하면 `/`)이다. 활성 패널을 바꾸면 뿌리도 바뀌고, 패널의 현재 폴더까지 펼쳐 `L`·`R`로 표시하는 기존 동작과 노드를 눌러 활성 패널을 이동하는 동작은 원격·SMB 노드에서도 같다. 반대쪽 패널이 같은 드라이브에 있을 때만 그 패널의 `L`/`R` 표시도 같이 보인다.
- 비목표: Rust 코드(`crates/`, `src-tauri`)·ts-client `Backend` 인터페이스 변경, 트리를 키보드로 쓰게 하기, 여러 드라이브를 한 트리에 동시에 보이기, 압축 안(`x.zip!/…`)·가상 탭에서의 새 표시 규칙(지금처럼 그 패널은 표시하지 않고, 활성 패널이 그런 탭이면 뿌리는 마지막 활성 드라이브 그대로 둔다), 새 설정 키·새 액션, 릴리스·배포·버전 올리기.

## 근거
- GitHub 이슈 #134 "sftp, ftp에서도 폴더트리가 동작 하도록 해 주세요 … 폴더 트리의 트리는 현재 있는 패널의 드라이브와 동기화 해서 표시 … sftp, ftp, smb의 경우 폴더의 모양이 나오지 않습니다".
- 지금 `ui/FolderTree.tsx`는 `localPath()`가 원격·압축·가상 탭을 `null`로 만들어 표시하지 않고, 뿌리는 `rootsOf(volumes)`(Windows는 `volumes`의 드라이브 문자들, 그 밖은 `/`)로 고정이다. 원격 경로는 `splitRemote`/`parentPath`/`baseName`(`packages/ts-client/src/backend.ts`)이 이미 `sftp://<id>/`를 루트로 다룬다.
- SMB는 ADR-0018상 OS 마운트라 로컬 경로(`/Volumes/<공유>`, `Z:\`)다. Windows에서 증상이 난다는 보고(이슈 작성자)는 코드만으로 원인을 확정하지 못했다 — 뿌리를 경로에서 정하면 `volumes`에 없는 드라이브도 보이지만, 실제 Windows에서는 확인하지 못한다.
- 관련 용어·ADR: ADR-0018(SMB는 OS 마운트), ADR-0019(원격 FS). 폴더 트리는 이슈 #125에서 추가됨(docs/05 `core.view.folder_tree`).
- 사이트 찾기(문서·문구): `git grep -n "folder_tree\|폴더 트리" -- docs README.md README.en.md apps/desktop/src/i18n ':!docs/adr'` → 고칠 곳은 `docs/05-actions-keybindings.md`의 `core.view.folder_tree` 줄(로컬 폴더만 보인다는 문장), `docs/06-config-plugins.md`의 `show_folder_tree` 줄, `apps/desktop/src/i18n/ko.ts`·`en.ts`의 `show_folder_tree.desc`(좌우 패널 위치 표시 설명이 새 동작과 어긋나면). README 두 파일에는 폴더 트리 언급이 없다.

## 완료 정의(DoD)
각 항목의 명령은 저장소 루트 기준이다(수정 전 상태를 한 번씩 실행해 확인했다).
1. 새 시험(전방 검사): `cd apps/desktop && bunx vitest run src/__tests__/folder-tree.test.tsx --reporter=verbose 2>&1 | grep -cE '✓.*(sftp|ftp://|SMB|활성 패널)'` → ≥5. 수정 전 0. 시험 제목에 `sftp`, `ftp://`, `SMB`(마운트 `/Volumes/공유`와 Windows 드라이브 `Z:\` 각각), `활성 패널`을 넣어 다음을 모두 단언한다.
   - sftp 패널(왼쪽, `sftp://kim@nas:22/docs`)이 활성이면 `data-tree-path="sftp://kim@nas:22/"` 뿌리 노드가 있고, 현재 폴더 노드에 `L` 표시가 붙고, 그 하위 폴더 노드(`…/docs/sub`)가 보이며, 로컬 `/home` 노드는 없다. 원격 폴더 노드를 누르면 활성 패널이 그 경로로 간다.
   - `ftp://` 패널도 같은 단언(뿌리 `ftp://<id>/`).
   - SMB 마운트: `volumes`에 `/Volumes/공유`가 있고 패널이 그 안이면 뿌리가 `/Volumes/공유`이고 하위 폴더가 보인다.
   - SMB Windows 드라이브: `volumes`에는 `C:\`만 두고 시드는 `Z:\share\docs\a.txt`일 때 패널이 `Z:\share`면 뿌리는 `Z:\`이고 `Z:\share\docs`가 보인다.
   - 활성 패널을 바꾸면(왼쪽 로컬 `/home/a`, 오른쪽 sftp) 뿌리가 로컬 `/` ↔ `sftp://…/`로 바뀌고, 다른 드라이브에 있는 반대 패널의 `L`/`R` 표시는 트리에 없다.
2. 새 시험이 고치기 전 컴포넌트에서 실패한다(red → green): `cd apps/desktop && cp src/ui/FolderTree.tsx /tmp/FolderTree.fixed.tsx && git show 3906575:apps/desktop/src/ui/FolderTree.tsx > src/ui/FolderTree.tsx; out=$(bunx vitest run src/__tests__/folder-tree.test.tsx --reporter=verbose 2>&1); cp /tmp/FolderTree.fixed.tsx src/ui/FolderTree.tsx; echo "$out" | grep -cE '(×|FAIL).*(sftp|ftp://|SMB|활성 패널)'` → ≥4(수정 전 컴포넌트에서 새 시험이 실패). 마지막에 `git diff --stat -- apps/desktop/src/ui/FolderTree.tsx`로 수정본이 복구돼 있는지 본다.
3. 회귀 보호(수정 전에도 통과): `bun run test` 전체(수정 전 196개 파일 통과·1개 건너뜀, 1656개 시험 통과)와 `bun run typecheck`. 기존 `folder-tree.test.tsx` 13개 시험은 그대로 통과한다.
4. 문서(전방 검사): `! grep -q "원격 탭은 표시하지 않는다" docs/05-actions-keybindings.md && grep "core.view.folder_tree" docs/05-actions-keybindings.md | grep -q "sftp"` → 성공(수정 전 `원격 탭은 표시하지 않는다` 1건, `sftp` 0건). `docs/06-config-plugins.md`의 `show_folder_tree` 줄과 i18n 설명도 새 동작과 맞는지 위 사이트 찾기 명령으로 확인한다.
- 실제 앱 확인: 실제 SFTP/FTP 서버, Windows, WKWebView 화면은 이 환경에서 확인하지 못한다. 시험은 FakeBackend 기준이고 run.md에 그 한계를 적는다.

## 작업 조각
- [ ] S1. `FolderTree.tsx`의 뿌리를 활성 패널의 드라이브(원격 `scheme://id/`, Windows 드라이브 문자, 로컬 볼륨 마운트 지점)로 정하고 원격 경로도 `localPath` 제외 대상에서 뺀다 — 새 시험을 `folder-tree.test.tsx`에 먼저 추가해 수정 전에 실패함을 보인 뒤 구현한다. 완료 기준: DoD 1·2·3이 충족되고 red 실패 출력이 run.md에 기록된다.
- [ ] S2. 문서와 설정 설명을 새 동작에 맞춘다(`docs/05`·`docs/06`, 필요하면 i18n ko/en의 `show_folder_tree.desc`). 완료 기준: DoD 4와 DoD 3의 `bun run test`·`bun run typecheck`가 통과한다. (depends: S1)
