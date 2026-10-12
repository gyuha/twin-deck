# run — 앱이 뒤에 있을 때 전역 단축키로 창을 불러온다 (이슈 #49)

워크플로우 없이 이 세션에서 직접 실행했다(작은 범위: 설정 키 1개 + Rust 모듈 1개 + 설정 항목 1개 + 문서).

## 슬라이스 결과
- S1 설정 키 `behavior.global_hotkey`(기본 `Mod+Alt+O`) + bindings·default-config.json 재생성 — ✅ as planned
- S2 `tauri-plugin-global-shortcut` 추가, `global_hotkey.rs`(변환·창 위치 계산·reveal·재등록), 시작과 설정 변경 때 등록, capability 권한 — ✅ as planned
- S3 설정 화면 항목 + ko/en 문구 + vitest — ⚠ `i18n-rust-messages` 테스트가 Rust 진단 문구 2개를 `RUST_INTERNAL`에 더하라고 요구해 더했다(계획에 없던 파일 `i18n/rust.ts`)
- S4 docs/06-config-plugins.md, README.md, README.en.md — ✅ as planned

## DoD baseline → after
- 1 `cargo test -p td-config global_hotkey`: 0개 → 1 passed
- 2 `cargo test -p twin-deck-desktop global_hotkey`: 0개 → 4 passed (변환·빈 값·잘못된 값·창 위치)
- 3 창 위치 순수 함수 테스트(`window_position_centers_on_monitor`): 없음 → passed
- 4 `cargo test -p twin-deck-desktop`: 113 passed (`up_to_date`, `capabilities_cover_plugins` 포함)
- 5 fmt·clippy(td-config, twin-deck-desktop) `-D warnings`: 모두 통과
- 6 `tsc --noEmit` 통과, 설정 항목 vitest 통과. 전체 vitest 실패는 4개(audio-preview, preview-scroll(PDF), theme-colors, theme) — **변경 전 깨끗한 트리에서도 같은 4개**라 이 변경과 무관한 기지 소음이다. 계획의 "pdf-preview 하나뿐"은 부정확했다. 처음 `@xterm/xterm`이 설치돼 있지 않아 `bun install`을 했다(저장소 파일 변경 없음).
- 7 `grep -c global_hotkey` 세 문서: 0·0·0 → 1·1·1
- 8 실제 앱 UAT: **눈으로 확인하지 못함** (OS 전역 단축키 등록, 포커스, 커서 모니터 이동은 이 환경에서 시험하지 않았다).

## 알아 둘 점
- 이미 앞에 있는 창이 커서와 같은 모니터에 있으면 위치를 옮기지 않는다(다른 모니터일 때만 그 모니터 가운데로 옮긴다).
- 설정이 바뀔 때마다 전역 단축키를 모두 풀고 다시 등록한다(다른 앱이 선점한 키는 stderr 경고만 남기고 앱은 계속 돈다 — 화면에는 알리지 않는다).
- 등록 함수가 설정 감시 스레드에서 불린다. 플러그인이 메인 스레드로 넘겨 주는지는 실제 앱에서 확인하지 못했다.
