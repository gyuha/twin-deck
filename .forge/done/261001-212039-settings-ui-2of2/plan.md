<!-- forge-slug: settings-ui-2of2 -->
<!-- task: 4 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 설정 화면 (Spacedrive primitives, 즉시 저장)

## 목표 / 비목표
- 목표: `Mod+,`(macOS `Cmd+,`, Windows/Linux `Ctrl+,`)로 메인 창을 덮는 **설정 화면**을 열고, 값 하나짜리 설정 14개를 `@spacedrive/primitives` 컨트롤로 바꾼다. 바꾸는 즉시 사용자 `config.toml`에 쓰고 앱에 반영하며, 항목별 "기본값으로"로 그 키를 사용자 설정에서 지운다.
- 비목표:
  - 배열 설정 편집(컬럼, Action Bar 버튼 목록, 즐겨찾기, zip 추가 확장자)과 키바인딩(`keybindings.toml`) 편집. 설정 화면에서 "설정 폴더 열기"(`core.config.open`)로 파일 편집을 안내한다.
  - `behavior.selection.shift_mode`(`extend`가 미지원 경고 값), `environment.terminal`(앱에서 쓰는 곳 없음).
  - CFG-01 TOML 텍스트 편집기(docs/06 §3, 나중 과제).
  - 별도 Tauri 창.
  - 기존 다이얼로그·팝업 메뉴·Actions Panel·파일 목록의 primitives 교체 (1/2와 같은 결정).

## 합의한 동작
- 배치(시각 확인에서 A안 확정): 위쪽 제목 줄(설정, Esc 표시) + 왼쪽 섹션 목록 + 오른쪽에 한 섹션. 항목은 왼쪽에 이름과 짧은 설명, 오른쪽에 컨트롤.
- 섹션과 항목(14개):
  - 모양: 테마(dark/light/midnight/noir/slate/nord/mocha/system 선택), 아이콘 크기(숫자), Action Bar 표시(스위치)
  - 목록과 선택: 순환 선택, 우클릭 선택, Quick Select 접두 일치, 아무 문자로 Quick Select 시작 (스위치 4개)
  - 표시 형식: 상대 날짜(스위치), 날짜 형식(입력), 시간 형식(입력), 크기 형식(선택: td-config가 허용하는 값만)
  - 확인: 영구 삭제 전에 확인, 휴지통 전에 확인 (스위치 2개)
  - 환경: 텍스트 편집기(입력)
  - 화면 아래쪽(또는 섹션 목록 끝)에 "설정 폴더 열기" 버튼.
- 저장: 스위치·선택은 바꾸는 순간, 입력창은 Enter나 포커스를 벗어날 때 저장한다. 사용자 `config.toml`의 해당 키만 바꾸고 다른 키·주석·순서는 보존한다(`toml_edit`). "기본값으로"는 사용자 설정에 값이 있을 때만 보이고, 누르면 그 키를 지운다(비게 된 테이블도 정리).
- 사용자 `config.toml`에 문법 오류가 있으면 덮어쓰지 않는다. 설정 화면 위쪽에 오류를 보여 주고 컨트롤을 비활성화한다.
- 반영: 쓰기 명령이 새로 병합된 설정(`Loaded`)을 돌려주고, UI는 그 값을 바로 적용한다. `config-changed` 이벤트는 기다리지 않는다(지난 작업 회고: 실제 Tauri 런타임에서 이벤트가 웹뷰에 닿는지 검증된 적이 없다). 이벤트가 오면 같은 값으로 한 번 더 적용될 뿐이다.
- 키보드: 새 액션 `core.settings.open`(기본 `Mod+,`), 새 스코프 `settings`. 설정 화면이 열려 있으면 패널 키는 무시되고, Esc로 닫힌다. 안의 이동은 기본 포커스 이동(Tab/Shift+Tab), 스위치는 Space, 선택 상자는 방향키.
- `@spacedrive/primitives`는 이 화면에서만 쓴다. Tailwind v4가 primitives의 클래스를 스캔하도록 `@source`를 지정한다. `THIRD_PARTY_NOTICES.md`에 추가한다(spaceui 저장소 MIT).

## 기준 문서
- 용어집: `.forge/CONTEXT.md`의 설정 화면, 사용자 설정, 내장 기본값, 테마
- 관련 ADR: 없음
- 선행 작업(권장 순서일 뿐 강제 아님): `spacedrive-design-1of2` — 이 화면은 1/2의 토큰과 테마 8종을 전제로 한다.
- 완료 정의(DoD):
  1. `cargo test -p td-config user_value` → 3개 이상 통과, 실패 0 (사전: 0개 실행, 전진 확인. 키 쓰기 시 주석·다른 키 보존, 키 삭제, 문법 오류 시 거부를 본다)
  2. `bun run --cwd apps/desktop test -- settings` → 설정 화면 테스트 파일이 통과 (사전: 파일 없음, 전진 확인. Mod+,로 열기, Esc로 닫기, 스위치 변경이 즉시 반영, "기본값으로", 문법 오류 시 비활성화, 패널 키 무시를 본다)
  3. `grep -c '@spacedrive/primitives' apps/desktop/package.json` → 1 이상 (사전 0, 전진 확인)
  4. `grep -c 'core.settings.open' packages/actions/src/defaults.ts` → 1 이상 (사전 0, 전진 확인)
  5. `grep -c toml_edit crates/td-config/Cargo.toml` → 1 이상 (사전 0, 전진 확인)
  6. `cargo test --workspace` → 실패 0 (회귀 방지: 착수 전 통과)
  7. `bun run test` → 실패 0 (회귀 방지: 착수 전 desktop 271개 통과. 1/2를 먼저 하면 그 결과 기준)
  8. `bun run typecheck`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` → 종료 코드 0 (회귀 방지)
  9. `cargo test -p twin-deck-desktop up_to_date` → 통과 (회귀 방지: 새 명령을 추가한 뒤 `bindings.ts`가 재생성되어 있음을 증명)
  10. 실제 앱(UAT): `Cmd+,`로 열어 테마를 바꾸면 즉시 바뀌는지, 스위치를 끄고 앱을 다시 켜도 유지되는지, `config.toml`에 쓴 주석이 남는지, "기본값으로"가 키를 지우는지 사용자가 확인한다. 실제 파일과 실제 Tauri 런타임이 필요해 명령으로 남길 수 없다.

## 작업 조각
- [ ] S1. td-config에 사용자 설정 키 쓰기/지우기(`toml_edit`, 원자적 쓰기, 문법 오류 시 거부) — 완료 기준: DoD 1·5 충족.
- [ ] S2. Tauri 명령 `set_config_value`/`reset_config_value`(새 `Loaded` 반환), bindings 재생성, ts-client(Tauri·fake) 메서드 — 완료 기준: DoD 9 충족, ts-client 테스트가 fake의 쓰기/지우기와 반환값을 확인. (depends: S1)
- [ ] S3. `@spacedrive/primitives` 설치와 Tailwind `@source`, 액션 `core.settings.open`(Mod+,)과 `settings` 스코프 — 완료 기준: DoD 3·4 충족, 앱이 빌드된다.
- [ ] S4. 설정 화면(섹션 5개 + 14개 항목 + 기본값으로 + 설정 폴더 열기 + 문법 오류 상태) — 완료 기준: DoD 2 충족. (depends: S2, S3)
- [ ] S5. `THIRD_PARTY_NOTICES.md`와 `docs/07-ui-spec.md`(설정 화면 절), `docs/01-feature-spec.md`(해당 행) 갱신 — 완료 기준: `grep -c '@spacedrive/primitives' THIRD_PARTY_NOTICES.md` → 1 이상. (depends: S3)
