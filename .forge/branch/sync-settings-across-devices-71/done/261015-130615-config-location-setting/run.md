# RUN — 설정 파일 저장 경로를 사용자가 지정한다 (task 165)

## 슬라이스 결과
- S1 td-config `location.rs`: `resolve_config_dir`·`change_config_location`·`has_config_files`·`read_config_location` — ✅ 계획대로 (계획의 set/clear 두 함수 대신 `change_config_location(local, current, target: Option, conflict)` 하나로 합침)
- S2 src-tauri: `ConfigState`가 `local_dir`와 `Mutex<Option<ConfigStore>>`를 들고 실행 중 교체, `get_config_location`·`config_location_has_files`·`set_config_location`·`pick_folder` 명령, `forward_config_changes`, `single_instance_in`이 포인터를 따름 — ✅
- S3 ts-client: backend·tauri·fake에 4개 메서드 — ⚠ 폴더 선택은 JS 플러그인 대신 Rust 쪽 `tauri-plugin-dialog` 호출(명령 `pick_folder`)로 해 화면 권한을 주지 않음
- S4 UI: 설정 화면 머리글 아래 "설정 저장 경로" 막대, 충돌 시 `choice` 대화상자, ko·en 문구, vitest 7개 — ✅
- S5 docs/06 `### 2.1 설정 저장 경로` 절과 파일 표 `location.toml` 행 — ✅

## 계획과 달라진 점·현장 결정
- 기능 테스트 `capabilities_cover_plugins`가 새 플러그인의 화면 권한을 요구했다. dialog는 Rust에서만 쓰므로 권한을 주는 대신 예외 목록(`NO_PERMISSIONS`)에 이유와 함께 넣었다(최소 권한).
- `i18n-rust-messages` 테스트: 새 Rust 오류 문구 6개를 `RUST_MESSAGES`에 영어와 함께 등록. commands.rs의 새 테스트 모듈은 그 테스트가 잘라 내는 `mod tests` 뒤로 옮겼다.
- 워크트리에 node_modules가 없어 `bun install`을 실행했다(잠금 파일 변경 없음).
- 실제 앱(WKWebView)에서 폴더 선택 창이 뜨는지는 띄워 보지 않았다. 테스트는 FakeBackend와 Rust 단위 테스트까지다.

## DoD 기준선 → 결과
1. td-config location 테스트: 0 → 9개 통과(`--list`에 location 9개)
2. twin-deck-desktop: config_location 테스트 0 → 5개 + `single_instance_follows_config_location`, 전체 128개 통과(`up_to_date` 포함)
3. state.json 로컬 유지: `config_location_state_stays_in_local_dir` 통과
4. single_instance 포인터 따름: 테스트 통과
5. vitest: "저장 경로" 테스트 파일 0 → 1개(7개 테스트), 전체 164파일 1363개 통과
6. tsc·clippy(-p td-config -p twin-deck-desktop -D warnings)·fmt --check: 모두 통과
7. docs/06 저장 경로 제목: 0 → 1
