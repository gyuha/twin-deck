<!-- forge-slug: windows-unmount-and-disk-space -->
# 실행 기록 — Windows 언마운트와 디스크 용량 조회

워크플로 없이 직접 실행했다(td-volumes 한 크레이트, 소규모).

## 슬라이스별 결과
- S1 드라이브 종류 판별 — ✅ `DriveKind`·`drive_kind_from_code`·허용 규칙(`windows_eject_command`). 테스트를 먼저 써서 컴파일 실패(red)를 확인한 뒤 구현. `windows-sys 0.59`를 `cfg(windows)` 의존성으로 추가.
- S2 용량 조회 — ✅ `GetDiskFreeSpaceExW` 구현, 기존 unix 테스트와 같은 두 케이스(총량·여유량·없는 경로)를 Windows 테스트로 추가해 통과.
- S3 Windows `SystemUnmounter` — ✅ 이동식은 PowerShell 셸 꺼내기, 네트워크는 `net use X: /delete /y`, 그 밖은 `NotRemovable` 오류. ⚠ 계획에 없던 추가: 셸 꺼내기는 사용 중이어도 성공(exit 0)으로 끝나서 드라이브가 사라졌는지 최대 3초 기다리고, 안 사라지면 "아직 사용 중" 오류를 낸다. 콘솔 창이 깜빡이지 않게 `CREATE_NO_WINDOW` 사용.
- S4 실제 앱 확인 — ⏳ 사람이 확인(UAT). 실제 USB 꺼내기·네트워크 연결 끊기는 자동 테스트로 검증하지 못했다.

## 계획과 다른 점
- `UnmountError::NotRemovable` 변종 추가(메시지에 드라이브 경로 포함). 기존 `match` 사용처는 없어 영향 없음.
- `Volumes::check`는 그대로 둠. `Fixed` 거부는 `SystemUnmounter`(Windows) 안에서 한다.
- 문서(`docs/m2-status.md`)의 "Windows 미검증" 문구는 날짜가 박힌 스냅샷이라 갱신하지 않았다.

## DoD baseline → after
1. `cargo test -p td-volumes` — 3 → 10 통과(새 테스트 7개: 종류·명령·거부·경로, 용량 2개 포함)
2. `cargo clippy -p td-volumes -- -D warnings` — 0 → 0 (회귀 방지, 이미 통과)
3. `cargo check -p twin-deck-desktop` — 통과. Windows 전용 의존성은 `[target.'cfg(windows)'.dependencies]`라 macOS/Linux 영향 없음(macOS/Linux 빌드는 이 PC에서 검증 못 함, cfg 분기만 확인)
4. 실제 앱(UAT) — 미확인

## 추가 수정: 앱 자신이 드라이브를 잡고 있어 "사용 중"으로 거부됨 (UAT 중 발견)
- 증상: `I:\`(왼쪽 패널과 `workspace` 탭이 이 드라이브)에서 언마운트하면 "아직 사용 중이어서 꺼내지 못했습니다". 용량 표시와 종류 판별은 정상 동작.
- 원인(가설): 열린 탭 경로마다 앱이 폴더 감시(Windows `ReadDirectoryChangesW`) 핸들을 `I:\` 안에 잡고 있다. 기존 흐름은 언마운트가 *성공한 뒤*에야 감시를 정리했다.
- 수정: `state/store.ts`에 `releaseWatches(mountPoint)`를 추가. 언마운트/꺼내기(`unmountVolume`, `menuVolumeAction`)는 시도 전에 그 볼륨 안의 감시를 풀고, 실패하면 `syncWatches()`로 되돌린다.
- 테스트: `drive-bar.test.tsx` 2개(시도 전 `unwatch`가 `unmount`보다 먼저, 실패 시 `unwatch`→`watch` 복원) — 수정 전 실패(red) 확인 후 통과. drive-bar·menus 27개 통과, `tsc` 통과.
- 남은 가능성: 이 탭 외에 다른 프로그램(탐색기, 백신 등)이나 앱의 다른 핸들(검색·큐 작업)이 잡고 있으면 여전히 거부된다. 실제 USB로 UAT 필요.

## 동작 변경 (사용자 요청): 언마운트 전에 첫 번째 드라이브로 이동
- 요청: "언마운트"를 누르면 첫 번째 기본 드라이브로 이동하고, 리소스를 반환한 뒤 언마운트. 반대쪽 패널도 같은 드라이브면 같이 이동.
- 구현: `store.ts`에 `leaveVolume(mountPoint)` — 그 볼륨 안의 모든 탭(양쪽 패널·배경 탭)을 목록의 첫 번째 다른 볼륨 루트로 옮기고 `syncWatches()`로 감시를 푼다. `unmountVolume`/`menuVolumeAction`이 언마운트 *전에* 호출. 앞서 추가했던 `releaseWatches`는 `leaveVolume`에 흡수되어 제거. 실패 시 탭을 되돌리지 않고 오류만 알린다(요청대로 이동이 먼저).
- 가드: 루트 볼륨(`/`)은 모든 탭이 그 안이라 옮기지 않는다(메뉴 경로). 이미 첫 번째 볼륨이면 목적지는 두 번째 볼륨.
- ⚠ TDD 이탈: 구현을 먼저 하고 테스트를 갱신했다(수정 전 red 미확인). `drive-bar.test.tsx`: 목적지가 홈→첫 볼륨, 실패 시 이동 유지, 반대쪽 같은 볼륨이면 함께 이동, 다른 볼륨의 반대쪽은 유지. drive-bar·menus 28개와 `tsc` 통과.
- 알려진 한계: Windows에서 `C:\`가 아닌 고정 디스크(예: `G:\`)의 언마운트 버튼을 누르면 탭이 옮겨진 뒤 "이동식/네트워크 드라이브가 아니라서…"로 거부된다. 첫 번째 볼륨(`C:\`)에서 누르면 두 번째 볼륨(`D:\`)으로 간다.
