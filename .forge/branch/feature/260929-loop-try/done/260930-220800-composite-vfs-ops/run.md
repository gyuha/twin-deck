# Run — composite-vfs-ops (#22)

## 결과
- `td-archive::CompositeFs`: 경로가 `x.zip!/…`(ADR-0012)이면 아카이브로, 아니면 `LocalFs`로 라우팅하는 `Vfs`. list/stat/mkdir/create_file/rename/remove/copy_file/info를 지원한다.
- 조합별 복사: 로컬→zip(`Source::Path`, 수정 시각·권한 유지), zip→로컬(권한·수정 시각 복원), zip→zip(임시 파일 경유). 중첩 zip은 `edit_in`으로 바깥까지 되쓴다.
- 경계를 넘는 rename은 `ErrorKind::CrossesDevices`(`VfsError::Io`)로 돌려 기존 `Ops::move_with`의 복사 후 삭제 대체 경로를 그대로 쓴다.
- `Ops::trash`는 `Vfs::can_trash`가 false이면(아카이브 안) `OpsError::Trash`로 거부한다. 영구 삭제만 된다.
- Tauri `Service`가 `LocalFs` 대신 `CompositeFs`를 써서 `list_dir`/`file_info`/`mkdir`/`touch`/`rename`/`detect_conflict`/큐(Copy·Move·Delete·Trash)가 `x.zip!/…` 경로를 그대로 처리한다.
- 테스트: `composite_copy_between_local_and_archive`(충돌 3종·재귀·권한·삭제·이름 변경·mkdir, 결과는 `unzip -tq`와 bsdtar로 확인), `composite_move_and_archive_to_archive`, `composite_nested_and_readonly_and_trash`, 서비스 `archive_paths_work_through_service_and_queue`. `can_trash` 가드는 변형(항상 true)으로 테스트가 실패함을 확인하고 원복했다.

## 계획과 다른 점
- 계획의 `Vfs::open_read`/`write_from` 스트림 메서드는 넣지 않았다. `CompositeFs::copy_file`이 네 가지 조합을 직접 처리해서 필요하지 않았고, 트레이트 표면을 늘리지 않는 편이 단순하다. 대신 `VfsError::Other`와 `Vfs::can_trash`(기본 true)를 더했다.
- `bindings.ts`는 DTO/명령이 바뀌지 않아 갱신할 것이 없다.

## 한계
- zip에 쓰는 연산마다 zip 전체를 다시 쓴다. 폴더를 통째로 넣으면 파일 수만큼 다시 쓰므로 큰 폴더에서는 느리다(일괄 쓰기는 이후 과제).
- 아카이브 경로에서는 미리보기(`preview`)와 감시(`watch`)가 아직 동작하지 않는다(UI 작업 archive-ui에서 다룬다). 심볼릭 링크는 아카이브 안에서 만들거나 읽을 수 없다.
- 확장자 설정(`extra_zip_exts`)은 서비스에서 빈 목록으로 연결했다.
