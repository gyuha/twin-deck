<!-- forge-slug: tab-position-1of2 -->
<!-- task: 158 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# 탭 위치 옵션 1/2: 설정 키·검증·설정 화면·번역 (이슈 #67)

## 목표 / 비목표
- 목표: 설정 `behavior.layout.tab_position`(`"top"` | `"bottom"`, 기본 `"top"`)을 추가하고, 잘못된 값은 경고 후 `top`으로 돌아가게 검증하고, 설정 화면 "모양" 탭에 선택 항목을 더하고 ko/en 문구를 쓴다. 탭 막대 그리기는 2/2에서 한다.
- 비목표: 탭 막대 그리기(2/2), 문서(2/2), 새 단축키·액션, 탭 막대 숨기기, 패널별 위치.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음.
- 설정 키 체크리스트(AGENTS.md): `td-config` 구조체(`crates/td-config/src/config.rs`의 `LayoutConfig` 등 `tab_style`이 있는 구조체) + `default.toml` → `task gen-types` → `ui/Settings.tsx` `SECTIONS` → 설정 탭 목록 테스트. enum 검증은 `crates/td-config/src/load.rs`의 `("behavior.layout", "tab_style", &["underline", "segments"])` 표에 같은 모양으로 더한다.
- 정의 완료(DoD):
  1. `grep -c 'tab_position = "top"' crates/td-config/src/default.toml` ≥ 1, `grep -c tab_position apps/desktop/src/ui/Settings.tsx` ≥ 1(작성 시점 둘 다 0 → 앞으로 향하는 확인).
  2. `cargo test -p td-config tab_position`이 1건 이상 통과(작성 시점 0 passed → 앞으로 향하는 확인). 이 테스트는 기본값이 `top`, `bottom` 저장·읽기, 잘못된 값은 경고와 함께 `top`으로 돌아감을 단언한다.
  3. `cargo test -p twin-deck-desktop up_to_date` 통과(바인딩·`default-config.json` 최신; 작성 시점에 통과 중인 회귀 방어).
  4. `cd apps/desktop && bunx vitest run src/__tests__/settings.test.tsx -t "탭 위치"` 통과(작성 시점 해당 테스트 없음 → 앞으로 향하는 확인). "모양" 탭에서 위치를 고르면 `behavior.layout.tab_position`에 저장됨을 단언한다.
  5. `cargo test -p td-config`, `cargo clippy -p td-config -- -D warnings`, `cargo fmt --check` 통과.
  6. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 전체 통과(병렬 간헐 실패는 단독 재실행으로 통과하면 인정).

## 작업 조각
- [ ] S1. 설정 구조체에 `tab_position: String`을 더하고 `default.toml`에 `tab_position = "top"`(한글 주석)을 쓰고 `load.rs` enum 검증 표에 `["top", "bottom"]`을 더한 뒤 `task gen-types`로 바인딩·`default-config.json`을 다시 만든다. Rust 테스트 `tab_position_*`를 쓴다. — 완료 기준: DoD 1(첫 줄)·2·3·5.
- [ ] S2. `ui/Settings.tsx` `SECTIONS`("모양" 탭, `tab_style` 근처)에 선택 항목(`type: "select"`)을 더하고 ko/en 문구(제목·설명·선택지 이름)를 쓰고, 설정 테스트에 이름에 "탭 위치"가 들어간 테스트를 더한다. FakeBackend 기본 설정도 맞춘다. — 완료 기준: DoD 1(둘째 줄)·4·6. (depends: S1)
