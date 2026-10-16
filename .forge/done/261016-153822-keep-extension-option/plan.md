<!-- forge-slug: keep-extension-option -->
<!-- task: 185 -->
<!-- tdd: off -->
# "확장자 유지" 옵션: 확장자 컬럼을 켜도 파일 이름에 확장자를 유지 (이슈 #86)

## 목표 / 비목표
- 목표: 설정 `behavior.table.keep_extension`(기본 꺼짐)을 추가하고, 설정 화면 "목록과 선택" 탭의 `확장자 컬럼 표시` 바로 아래에 `확장자 유지`(영어 `Keep extension`) 스위치를 둔다. 확장자 컬럼이 켜져 있고 이 옵션이 켜져 있으면 파일 이름에 확장자가 그대로 보이고 확장자 칸은 비며 헤더 정렬은 그대로 된다(#53의 Commander One 방식). 꺼짐(기본)에서는 지금 동작이 그대로다.
- 구현 힌트: `ui/FileTable.tsx`의 `hasExtColumn`(= 확장자 컬럼이 보이면 이름에서 확장자를 뺀다)을 `keep_extension`이 켜지면 이름을 빼지 않게 하고, 확장자 칸은 `cellText(e, "extension", …)` 결과 대신 빈 문자열로 그린다. 설정 키 체크리스트(AGENTS.md): `td-config` 구조체(`BehaviorTable`) + `default.toml` → `task gen-types` → `ui/Settings.tsx` `SECTIONS`(점 표기 키 `behavior.table.keep_extension`, 항목 순서는 `view.table.columns`(확장자 컬럼 표시) 바로 다음) → ko/en 문구 → 설정 테스트.
- 비목표: 확장자 컬럼 켜기/끄기 동작 변경, 새 단축키·액션, `CHANGELOG.md`·버전.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음.
- 정의 완료(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/keep-extension.test.tsx` 통과(작성 시점: 파일 없음 → 앞으로 향하는 확인). 테스트는 (a) 컬럼 켬 + 유지 켬: 이름 칸에 전체 이름, 확장자 칸은 비고 헤더 클릭으로 확장자 정렬이 되며, (b) 유지 끔: 이름 칸에서 확장자가 빠지고 확장자 칸에 `txt`가 보이며, (c) 컬럼 끔 + 유지 켬: 이름 칸 변화 없음, (d) 설정 화면에서 `확장자 유지` 스위치가 `확장자 컬럼 표시` 행 바로 다음에 있고 켜면 `behavior.table.keep_extension`이 저장되며, (e) 영어에서는 `Keep extension`임을 단언한다.
  2. `cargo test -p td-config keep_extension`이 1건 이상 통과(작성 시점 0건 → 앞으로 향하는 확인). 기본 꺼짐과 저장·읽기를 단언한다.
  3. `grep -c 'keep_extension = false' crates/td-config/src/default.toml` ≥ 1, `grep -c keep_extension packages/ts-client/src/generated/bindings.ts` ≥ 1(작성 시점 둘 다 0), `cargo test -p twin-deck-desktop up_to_date` 통과(작성 시점에 통과 중인 회귀 방어; 바인딩 재생성 뒤에도 통과해야 한다).
  4. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 전체 통과(작성 시점에 통과 중인 회귀 방어; 기존 `columns-sort`의 확장자 컬럼 테스트 포함, 병렬 간헐 실패는 단독 재실행으로 통과하면 인정).
  5. `cargo clippy -p td-config -- -D warnings`와 `cargo fmt --check` 통과(작성 시점에 통과 중인 회귀 방어).
  6. `grep -c keep_extension docs/06-config-plugins.md` ≥ 1(작성 시점 0 → 앞으로 향하는 확인). 확장자 컬럼을 설명하는 문단(`docs/06`의 "설정 → 목록과 선택 → 확장자 컬럼 표시" 부근)에 새 옵션을 적는다.
  - 이 DoD는 실제 앱(WKWebView)의 겉모양을 증명하지 못한다. 사람이 눈으로 확인해야 한다.

## 작업 조각
- [ ] S1. Rust: `BehaviorTable`에 `keep_extension: bool`, `default.toml`에 `keep_extension = false`(한글 주석), Rust 테스트 `keep_extension_*`, `task gen-types`. — 완료 기준: DoD 2·3·5.
- [ ] S2. UI: `FileTable.tsx` 동작 변경, `Settings.tsx` 항목(`확장자 컬럼 표시` 바로 아래)과 ko/en 문구(설명에 "확장자 컬럼을 켰을 때 적용"), `fake.ts` 기본 설정이 필요하면 맞춤, 테스트 `keep-extension.test.tsx`. — 완료 기준: DoD 1·4. (depends: S1)
- [ ] S3. 문서: `docs/06-config-plugins.md`에 옵션을 적고 전체 검증을 돌린다. — 완료 기준: DoD 4·5·6. (depends: S2)
