<!-- forge-slug: td-config -->
<!-- task: 12 -->
<!-- priority: high -->
<!-- tdd: off -->
# td-config: TOML 설정 로딩/병합/감시/검증과 키바인딩 설정

## Goal / Non-goals
- Goal: docs/06-config-plugins.md대로 `crates/td-config`를 구현한다. 기본값 → 사용자 설정 병합, 잘못된 값·알 수 없는 키·잘못된 키 표기는 앱을 죽이지 않고 경고 목록으로 반환, 파일 변경 감시와 재로딩, 키바인딩 설정(`[keybindings]`, OS별 섹션, `"F5" = "none"` 해제, 인수 `id`와 같은 레벨 키), 표시 옵션(CFG-05: 아이콘 크기, 상대 날짜, 날짜/시간 strftime 포맷, 크기 표기), 삭제/휴지통 확인 on/off(OP-13), 액션 바 표시(`layout.show_action_bar`), Quick Select 옵션(NAV-06: 접두 일치/아무 문자 활성화), 즐겨찾기(NAV-08 데이터). TS 쪽은 설정 조회 command와 `packages/keybinds` 병합 연동, 상태 표시줄 경고 아이콘·목록.
- Non-goals: 설정 내장 편집기(P3), 플러그인 설정, 테마 정의(다음 태스크는 테마 토큰만 사용).

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0006, 0010
- Definition of Done: `cargo test -p td-config` 이름 지정 테스트 통과: `config_merge_precedence`(기본 < 사용자 < OS별 섹션), `config_invalid_keeps_running`(깨진 TOML/타입 오류/알 수 없는 키가 패닉 없이 경고+기본값), `config_watch_reload`(파일을 고치면 재로딩 이벤트), `keybinding_unbind_none`(`"F5" = "none"`으로 기본 바인딩 해제, 해제 후 F5가 해석되지 않음 — 이 검증은 TS `packages/keybinds`/`actions` vitest 쪽 병합 테스트에도 대응). 설정 경고가 UI 상태 표시줄에서 표시되는 vitest. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. 스키마/기본값/병합/경고 수집 — completion criterion: `config_merge_precedence`, `config_invalid_keeps_running` 통과
- [ ] S2. 감시와 재로딩 이벤트 — completion criterion: `config_watch_reload` 통과 (depends: S1)
- [ ] S3. 키바인딩 설정 → TS 병합(해제, 인수, OS 섹션) — completion criterion: `keybinding_unbind_none` 및 TS 병합 vitest 통과 (depends: S1)
- [ ] S4. Tauri command/event, 앱 시작 시 로딩과 UI 경고 표시, 표시 옵션/확인 옵션/Quick Select 옵션이 스토어에 반영 — completion criterion: 옵션별 vitest 통과 (depends: S1, S3)
