# RUN — td-config
- S1 스키마/기본값/병합/경고 — ✅ `crates/td-config`: 내장 default.toml, 테이블 깊은 병합(배열 교체), 알 수 없는 키·타입 오류·허용값 위반을 항목별 경고로 수집, 즐겨찾기는 항목별 검증(그룹 한 단계), 최종 역직렬화 실패 시 기본값. `config_merge_precedence`, `config_invalid_keeps_running`
  - 테스트가 잡은 버그: default.toml에서 최상위 키 `favorites = []`가 `[view.table]` 뒤에 있어 그 테이블의 키로 해석됨 → 최상위 키를 파일 맨 앞으로.
- S2 감시/재로딩 — ✅ `ConfigStore`(td-watch 사용). 문법 오류면 이전 유효 설정 유지 + 경고(줄 번호). `config_watch_reload`
- S3 키바인딩 — ✅ Rust `BindingSpec`(none=해제, 인라인 테이블 인수, scope, OS 섹션) + TS `mergeUserBindings`(해제는 모든 스코프에서, 존재하지 않는 액션/키/스코프는 경고·무시), Keymap `resolveBinding`(인수 포함). `keybinding_unbind_none`(Rust는 파싱, 실제 해제 효과는 TS vitest)
- S4 앱 연결 — ✅ `get_config` command, `ConfigChanged` 이벤트, 앱 설정 디렉터리 감시(열지 못하면 기본값+경고). 기본 설정 fixture(`default-config.json`)를 Rust가 만들고 드리프트 테스트, TS FakeBackend가 그 fixture를 그대로 쓴다. 상태 표시줄 경고 버튼→목록, OP-13 확인 on/off, circular_selection, quick_select 옵션(+`core.quickselect.start` Mod+F), right_click_select.
⚠ 미구현/한계: `shift_mode = "extend"`는 값은 받되 invert로 동작하고 경고를 낸다. 즐겨찾기 그룹 중첩은 한 단계. display/layout/environment/favorites/theme 설정은 파싱·검증만 하고 소비는 후속 태스크(컬럼, 액션 바, 파일 액션, 메뉴, 테마).
⚠ 미검증: 실제 Tauri 런타임에서 앱 설정 디렉터리 감시와 ConfigChanged 수신.
DoD: cargo test -p td-config 4 passed, desktop vitest 61 passed, actions 19, drift 테스트 통과.
