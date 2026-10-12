<!-- forge-slug: global-hotkey-show-window -->
<!-- task: 139 -->
<!-- tdd: off -->
# 앱이 뒤에 있을 때 전역 단축키로 창을 불러온다 (이슈 #49)

## Goal / Non-goals
- Goal: 앱이 백그라운드·다른 창 뒤·최소화 상태일 때 전역 단축키(기본 `Mod+Alt+O`)를 누르면 창이 보이고 포커스를 받으며, **마우스 커서가 있는 모니터**로 옮겨져 나타난다. 단축키는 설정(`behavior.global_hotkey`)에서 바꾸거나 비워서 끌 수 있고, 설정이 바뀌면 재시작 없이 다시 등록된다.
- Non-goals: 이미 앞에 있는 창을 다시 숨기는 토글 동작, 여러 전역 단축키, 단축키 녹화(키 눌러 입력) UI(설정은 텍스트 입력), 메뉴바/트레이 아이콘, 창 크기·내용 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈: https://github.com/gyuha/twin-deck/issues/49
- Definition of Done:
  1. `cargo test -p td-config` 통과, 기본 설정 `behavior.global_hotkey == "Mod+Alt+O"`를 단언하는 테스트가 있다.
  2. `cargo test -p twin-deck-desktop global_hotkey` 가 통과하고 테스트가 3개 이상이다: `Mod+Alt+O` 변환(macOS는 Command+Alt+O, 그 외 Control+Alt+O 기준 문자열), 빈 문자열은 "등록 안 함", 잘못된 문자열은 패닉 없이 오류.
  3. 창을 놓을 위치를 계산하는 순수 함수(모니터 사각형 + 창 크기 → 모니터 중앙 위치)에 단위 테스트가 있고 통과한다. 커서가 있는 모니터를 못 찾으면 기존 모니터에서 그대로 보인다(위치를 안 옮김).
  4. `cargo test -p twin-deck-desktop` 전체에서 `up_to_date`(bindings/default-config.json 최신)와 `capabilities_cover_plugins`(global-shortcut 권한 포함)가 통과한다.
  5. `cargo fmt --check`, `cargo clippy -p td-config -- -D warnings`, `cargo clippy -p twin-deck-desktop -- -D warnings` 통과.
  6. `cd apps/desktop && bunx tsc --noEmit` 통과, 설정 화면에 `behavior.global_hotkey` 항목이 있음을 단언하는 vitest가 있고 통과한다. 전체 `bunx vitest run`의 실패는 기지의 `pdf-preview` 하나뿐이다.
  7. `docs/06-config-plugins.md`, `README.md`, `README.en.md`에 `global_hotkey`(단축키 설정)가 적혀 있다: `grep -c global_hotkey docs/06-config-plugins.md README.md README.en.md` 각각 ≥1. (세 파일 모두 사전 상태 0.)
  8. 실제 앱에서 다른 창 뒤/최소화일 때 단축키로 창이 앞으로 오고 커서 모니터로 이동하는지는 WKWebView·OS 동작이라 테스트로 증명할 수 없다. run.md에 "눈으로 확인하지 못함"으로 적고 단정하지 않는다.

## Work slices
- [ ] S1. 설정 키 `behavior.global_hotkey`(문자열, 기본 `"Mod+Alt+O"`, 빈 값 = 끔)를 `td-config` 구조체·`default.toml`에 더하고 `task gen-types`로 bindings·default-config.json을 다시 만든다 — completion criterion: DoD 1, DoD 4의 `up_to_date`.
- [ ] S2. `tauri-plugin-global-shortcut`을 더하고(Cargo.toml, `main.rs` 플러그인 등록, capability 권한 `global-shortcut:default`) `Mod+…` 문자열을 플러그인 단축키로 바꾸는 변환 함수와 "창 보이기" 함수(unminimize → 커서 모니터 중앙으로 이동 → show → set_focus)를 새 모듈로 만든다. 시작 시 설정값으로 등록하고 `ConfigChanged` 처리 시 이전 등록을 풀고 새 값으로 다시 등록한다. 등록 실패(다른 앱이 선점 등)는 앱을 죽이지 않고 경고로 남긴다 — completion criterion: DoD 2, 3, 4의 `capabilities_cover_plugins`, DoD 5의 clippy. (depends: S1)
- [ ] S3. `ui/Settings.tsx` `SECTIONS`에 `behavior.global_hotkey` 텍스트 항목을 더하고 ko/en 문구를 채운다. 설정 탭 목록 테스트가 있으면 맞춘다 — completion criterion: DoD 6. (depends: S1)
- [ ] S4. `docs/06-config-plugins.md`, `README.md`와 `README.en.md`(한 쌍, 같은 커밋)에 설정 항목과 기본 단축키를 적는다 — completion criterion: DoD 7.
