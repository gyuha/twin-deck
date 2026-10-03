<!-- forge-slug: volbar-store-ui -->
<!-- task: 33 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# 드라이브 바: 볼륨 선택·언마운트·남은 용량 표시 (스토어 + UI)

## 목표 / 비목표
- 목표: Double Commander처럼 **각 패널 위에 드라이브 바**를 둔다(`Pane`에서 `TabBar` 위).
  - **윗줄(마운트된 볼륨 버튼들)**: `role="toolbar"`, 이름 `드라이브 (왼쪽 패널)`/`(오른쪽 패널)`. 볼륨마다 버튼 하나(이름은 `v.name`). 이 패널 활성 탭의 경로가 속한 볼륨의 버튼은 강조(`aria-pressed="true"` + 강조 스타일). 버튼을 누르면 그 패널을 활성화하고 그 볼륨의 마운트 경로로 이동한다.
  - **아랫줄(현재 볼륨 정보)**: `role="status"`. 왼쪽에 현재 볼륨 이름, 오른쪽에 `<크기> 남음`(예: `73.8 GB 남음`, `lib/format.ts`의 `formatSize`와 `display.size_format` 설정을 쓴다. 전체 용량은 `title` 속성으로). 루트(`/`)가 아닌 현재 볼륨에는 `언마운트` 버튼(`aria-label="언마운트"`)이 있다.
  - 용량을 알 수 없으면(조회 실패, 가상 탭, 어느 볼륨에도 속하지 않음) 남은 용량 글자를 **표시하지 않고** 오류 알림도 띄우지 않는다.
- 스토어/로직:
  - 순수 함수 `lib/volumes.ts`의 `volumeOf(path, volumes)`: 마운트 경로가 경로 경계에서 접두인 볼륨 중 **가장 긴 것**(`/`는 모든 경로를 포함). 단위 테스트 포함.
  - 상태 `volumes: VolumeDto[]`, `diskSpace: Record<PaneId, DiskSpaceDto | null>`. `refreshVolumes()`(목록과 두 패널의 용량을 갱신)를 앱 시작, 창 포커스 복귀, 폴더 이동·목록 다시 읽기 뒤에 부른다. 용량 조회 실패는 조용히 `null`로 둔다.
  - `selectVolume(pane, mountPoint)`, `unmountVolume(pane)`. **언마운트는 먼저 `backend.unmountVolume`을 시도하고, 성공했을 때만** 그 볼륨 안에 경로가 있는 **모든 탭**(양쪽 패널, 배경 탭 포함)을 홈(`userDirs.home`, 없으면 `/`)으로 옮기고 목록을 갱신한다. 실패하면 오류를 알리고(`notice`) 아무 패널도 옮기지 않는다. 루트 볼륨은 시도하지 않는다.
- 비목표: 추출(eject) 버튼(기존 Alt+1 메뉴의 E 키로 남겨 둔다), 마운트(연결) 기능, 볼륨 아이콘, 드라이브 바 숨김 설정, 새 키 바인딩.

## 기준 문서
- 용어집: 없음 · 관련 ADR: 없음
- 완료 정의(DoD): `.forge/branch/feat/volume-bar/loop.md`의 C3 + 전체 완료 조건 C1~C5.
  1. `apps/desktop/src/__tests__/drive-bar.test.tsx`(신규, 이 작업이 만든다)에 아래 테스트가 **정확히 이 이름으로** 있고 통과: D1 "각 패널 위에 마운트된 볼륨 버튼이 나온다" · D2 "현재 폴더가 속한 볼륨이 강조된다" · D3 "볼륨 버튼을 누르면 그 패널이 그 볼륨의 루트로 이동한다" · D4 "현재 볼륨의 남은 용량이 표시된다" · D5 "다른 볼륨으로 가면 그 볼륨의 남은 용량으로 바뀐다" · D6 "현재 볼륨을 언마운트하면 그 볼륨 안의 패널은 홈으로 옮겨지고 목록에서 빠진다" · D7 "루트 볼륨에는 언마운트 버튼이 없다" · D8 "언마운트에 실패하면 알리고 패널을 옮기지 않는다" · D9 "용량을 알 수 없으면 남은 용량을 표시하지 않고 오류도 내지 않는다". (사전: 파일 없음 → 전진 확인)
  2. 테스트는 `FakeBackend`(`volumes`, `diskSpaces`, 언마운트 기록)로 구동한다. D4/D5는 표시된 글자를 단언한다(예: `/`의 free 73.8e9 → `73.8 GB 남음`, USB의 free 1.5e9 → `1.5 GB 남음`). D6는 언마운트 후 `listVolumes`에서 빠지고 그 볼륨 안에 있던 패널의 경로가 홈이 된 것을 단언. D8은 `unmountVolume`이 거부되게 하고 패널 경로가 그대로이며 오류 알림이 보이는 것을 단언.
  3. `lib/volumes.ts`의 `volumeOf` 단위 테스트(`volumes.test.ts`): 가장 긴 접두 선택, `/Volumes/USB2`가 `/Volumes/USB`로 오인되지 않는 경계(접두 문자열이 아니라 경로 경계), 어느 것에도 안 맞으면 null — 통과.
  4. 전체 완료 조건 C1~C5가 모두 통과(`loop.md` 참조). 의도된 변경으로 기존 테스트를 고쳤다면 `run.md`에 이유를 남긴다.
  5. 실제 앱(UAT): 외장 디스크를 실제로 마운트·언마운트하고 용량이 보이는지는 자동 검사 범위 밖이라 사람이 확인한다(검증 한계로 명시).

## 작업 조각
- [ ] S1. `lib/volumes.ts`(`volumeOf`)와 단위 테스트 — 완료 기준: DoD 3.
- [ ] S2. 스토어: `volumes`/`diskSpace` 상태, `refreshVolumes`, `selectVolume`, `unmountVolume`과 갱신 시점 연결 — 완료 기준: DoD 1의 D3, D6, D8 로직. (depends: S1)
- [ ] S3. `DriveBar.tsx`와 `Pane` 연결, 용량 글자 표시 — 완료 기준: DoD 1의 D1, D2, D4, D5, D7, D9. (depends: S2)
- [ ] S4. 전체 회귀·품질 확인과 기존 테스트 영향 점검 — 완료 기준: DoD 4. (depends: S3)
