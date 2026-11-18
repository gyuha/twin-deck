# 실행 기록 — 단축키 편집 백엔드 (1/2)

워크플로 없이 메인 세션에서 직접 실행했다(작업 단위가 직렬로 의존해 병렬 이득이 없음). TDD: 실패 테스트 8개 먼저 작성 → 구현 → 통과.

- S1 `binding_edit.rs`: `set_user_binding`/`remove_user_binding` (toml_edit, 현재 OS 섹션, 대소문자 무시 매칭) — ✅ 계획대로
- S2 `migrate_fkeys` (공통 섹션, 기존 키 우선, 멱등) — ✅ 계획대로
- S3 시작 시 이전 호출, `fkeys` 스키마 제거, `set_keybinding`/`reset_keybinding` 명령 → gen-types → backend/tauri/fake — ⚠ 계획보다 범위가 넓어짐: 스키마를 지우자 UI(App 키맵 병합, ActionBar 하단 바, 설정 F키 행·조합키 추가/삭제)가 컴파일되지 않아 1/2에서 keybindings 경로로 옮김(`fkeyValues`, `withAppArgs`). F키 테스트 6개 파일도 갱신.

## 그때그때 내린 결정
- `remove_user_binding`은 현재 OS 섹션과 **공통 섹션**에서 지운다(공통에만 있으면 "기본값으로"가 안 먹으므로). 공통은 다른 OS에도 영향 — 클라우드 공유 시 다른 기기의 같은 키도 기본으로 돌아간다.
- 조합키 줄 추가는 이제 `fkey_bar.<키> = false`를 만든다(옛 `fkeys.<키> = ""` 대신).
- 앱 실행 인수(`app`, `key`)는 파일에 쓰지 않고 실행 시 `fkey_apps`에서 채운다.
- 이전으로 `[fkeys]` 표 머리 위 주석은 함께 사라진다(그 표에 붙은 장식이라).
- 새 Rust 문구 3개를 `i18n/rust.ts`에 추가.

## 완료 정의 baseline → after
- `cargo test -p td-config`: 통과 → 통과 (회귀 가드)
- `up_to_date`: 통과 → 통과 (재생성 후)
- `cargo clippy -p td-config -D warnings`: 통과 → 통과 (twin-deck-desktop도 통과)
- `tsc --noEmit`: 통과 → 통과
- `vitest run`: 1 실패(`i18n-rust-messages`의 `한글 출력`, td-launch 테스트 리터럴, 기존부터) → 같은 1건 + 부하 시 타이밍 실패 3건(단독 재실행 75/75 통과)
- `grep -n "pub fkeys" config.rs`: 걸림 → 없음

## 후속 후보

<!-- followup: fu-a1c4e7b29d10 | source: shortcut-editor-1of2 | task: 214 | date: 2026-11-18 | status: open | taken: - -->
- `i18n-rust-messages` 테스트의 기존 실패: `crates/td-launch/src/lib.rs:490`의 테스트 리터럴 `한글 출력`을 내부용 목록에 넣는다.
  Evidence: 단축키 작업 전(stash 상태)에도 같은 1건이 실패했다.
