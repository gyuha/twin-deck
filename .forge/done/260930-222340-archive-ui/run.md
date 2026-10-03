# Run — archive-ui (#23)

## 결과
- Rust: 설정 `file_systems.zip.additional_extensions`(기본 `[]`), 서비스가 설정 로드/변경 시 `CompositeFs`의 확장자 목록을 갱신(복제본끼리 `Arc<RwLock>` 공유).
- Rust: `td_archive::start_edit`/`EditSession` — 아카이브 안 파일을 임시 폴더로 추출, 300ms(테스트는 40ms) 간격으로 임시 파일 변경을 감시(변경 후 한 번 더 같은 상태일 때 저장 완료로 판단), 바뀌면 `CompositeFs::copy_file`로 되쓰기. 제자리 저장과 원자적 저장(이름 바꿔 덮어쓰기) 모두 반영. 되쓰기 실패는 `last_error()`. 세션을 버리면 감시 중지 + 임시 파일 삭제. `edit_paths` 명령이 아카이브 경로를 임시 경로로 바꿔 편집기를 실행한다.
- Rust: `open_as_archive`(ARC-04) — `CompositeFs`에 세션 단위 "강제 아카이브" 등록, 매직 바이트(`sniff_kind`)로 zip/tar.gz/tar.bz2/tar 판별, 아니면 오류. `split_archive_path_with`, `edit_in_with` 추가.
- TS: `isArchiveName/archiveRoot/isArchivePath/archiveFileName`, `Backend.openAsArchive`, 스토어의 `open`(아카이브 파일 Enter), `openAsArchive`, `goUp`(아카이브 루트에서 나오면 커서가 그 아카이브 파일), `trashTargets`(아카이브 안이면 안내 후 중단), 브레드크럼 경계 표시, 액션 `core.open.as_archive`(기본 키 없음, Actions Panel로 실행), FakeBackend 아카이브 모사.
- 테스트: Rust `archive_edit_writes_back`(+중첩/실패), `composite_open_as_archive_ignores_extension`, 서비스 `editing_an_archive_file_writes_back_through_the_launcher`(편집기 fake, `unzip -p`로 확인)·`open_as_archive_makes_any_zip_file_navigable`·`additional_zip_extensions_apply_to_the_service`, `ts_archive_lists_match_rust`(TS/Rust 확장자 목록 일치). UI `archive-nav.test.tsx` 12개(열기, 중첩, 상위 이동+커서, 브레드크럼, 추가 확장자, Open As, 휴지통 안내, 영구 삭제, 복사 양방향, F4). 변형 검사: `open()`의 아카이브 분기를 끄면 9개, `goUp` 포커스 이름을 되돌리면 1개 실패.

## 계획과 다른 점 / 발견
- Open As는 확장자 기반 분해(ADR-0012)로는 표현할 수 없어서 "강제 등록" 방식을 넣었다. 등록은 세션 동안만 유지되므로, 앱을 다시 켜면 복원된 `x.bin!` 탭은 일반 경로로 취급되어 가장 가까운 상위 폴더로 옮겨진다.
- FakeBackend는 아카이브를 `x.zip!` 가상 폴더 노드로 모사하며 실제 zip 동작은 Rust 테스트가 맡는다. Open As의 형식 판별은 fake에서 `PK` 시작 여부로 흉내낸다(fake만 검증).
- 아카이브 경로는 파일 감시 대상에서 빠진다(감시 등록 실패는 무시). 편집 되쓰기로 아카이브 내용이 바뀌어도 그 패널은 자동으로 새로고침되지 않는다(다른 작업 뒤 재조회 때 반영).

## 한계
- 편집 세션은 앱이 끝날 때까지(또는 임시 파일이 사라질 때까지) 살아 있고 세션마다 스레드 하나가 300ms 간격으로 확인한다. 편집기 종료 감지는 하지 않는다.
- 실제 Tauri 창에서의 F4/Enter/Open As 동작은 확인하지 못했다(fake 백엔드 UI 테스트 + Rust 서비스 테스트로만 검증).

## 봉인 중 발견한 불안정 요인 (수정함)
- `archive_edit_writes_back`이 워크스페이스 전체 실행에서 한 번 실패했다. 원인은 구현이 아니라 테스트 폴링: Info-ZIP `unzip`이 파일 크기를 `stat`한 뒤 따로 `open`하는데, 그 사이 되쓰기가 zip을 원자적으로 교체하면 EOCD를 못 찾고 실패한다. 폴링 중 실패는 "아직"으로 처리하고(`unzip_p_now`), 값이 맞은 뒤에 엄격한 `unzip_p`/`unzip_ok`로 다시 확인하도록 고쳤다.
- `td-watch` 테스트(`watch_external_change` 등)가 워크스페이스 실행에서 반복적으로 타임아웃했다(단독 실행은 통과). 이 머신의 `fseventsd`가 유휴 상태에서도 CPU ~100%로 밀려 있어 이벤트가 5초 넘게 늦었다. 이벤트가 와야 하는 검사의 상한 `WAIT`만 5초→30초로 늘렸다(부정 검사 800ms는 그대로, 이벤트가 오면 즉시 반환).
