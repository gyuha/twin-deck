# RUN — 설정 내보내기·가져오기 (zip) (task 166)

## 슬라이스 결과
- S1 td-config `transfer.rs`: `export_config_zip`·`import_config_zip`, td-config에 `zip = "8.6.0"` — ✅ 계획대로 (1MB 크기 제한 추가)
- S2 src-tauri `export_config`·`import_config` 명령, `ConfigState::export_zip`·`import_zip` — ✅ (가져오기 뒤 ConfigChanged는 따로 보내지 않고 파일 감시가 다른 창에 알림)
- S3 ts-client `pickSaveFile`·`pickFile`·`exportConfig`·`importConfig` — ✅ 선택 창은 165와 같이 Rust 쪽 dialog 호출(`pick_save_file`·`pick_file`)
- S4 UI: 설정 화면 저장 경로 막대에 "내보내기…"·"가져오기…", 가져오기 전 확인 창, 성공 알림, 실패는 설정 화면 경고줄, ko·en, vitest 5개 — ✅
- S5 docs/06 `### 2.2 설정 내보내기·가져오기` — ✅

## 계획과 달라진 점·현장 결정
- task 165의 vitest 파일에 타입 오류(`config.behavior.zebra_rows` → 실제는 `behavior.table.zebra_rows`)가 있었다. 165의 tsc는 그 테스트를 쓰기 전에 돌려 이 오류를 놓쳤고, 같은 오류 때문에 "그 폴더의 설정 사용" 테스트가 없는 속성에 값을 넣고 그 값을 읽어 공허하게 통과하고 있었다. 이번에 경로를 고쳐 실제 적용을 확인하게 했다.
- zip 맨 위 두 이름만 읽어 `../`·하위 폴더 항목은 무시(경로 탈출 차단).
- `service::tests::coalesce_batches_a_burst_and_flushes_after_the_last_event`가 가끔 실패한다(이번 변경 테스트를 빼고 돌려도 12번 중 1번). AGENTS.md에 적힌 기존 시간 의존 테스트다.
- 실제 앱에서 저장·열기 선택 창을 띄워 보지는 않았다.

## DoD 기준선 → 결과
1. td-config export/import 테스트 0 → 8개, 전체 17+47 통과
2. twin-deck-desktop: export/import 테스트 0 → 3개, 전체 131 통과(up_to_date 포함, coalesce 간헐 실패 제외)
3. vitest: 내보내기·가져오기 테스트 파일 0 → 1(5개), 전체 165파일 1368 통과
4. tsc·clippy·fmt 통과
5. docs/06 내보내기 제목 0 → 1 (저장 경로 포함 2)
