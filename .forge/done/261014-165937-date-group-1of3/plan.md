<!-- forge-slug: date-group-1of3 -->
<!-- task: 155 -->
<!-- part: 1/3 -->
<!-- tdd: off -->
# 날짜 구간 그룹핑 1/3: 설정 키·구간 계산·설정 스위치 (이슈 #62)

## 목표 / 비목표
- 목표: 설정 `behavior.table.group_by_modified`(불리언, 기본 꺼짐)를 추가하고, 수정일을 구간으로 나누는 순수 계산(`apps/desktop/src/lib/dateGroups.ts`)을 만들고, 설정 화면(모양)에 스위치를 둔다. 표 그리기는 2/3에서 한다.
- 구간 규칙(위→아래, 최신이 위): `오늘` · `어제` · `이전 7일` · `이전 30일` · 이번 해는 월별(`6월`) · 지난 해는 연도별(`2025`) · `날짜 없음`(수정일 없음). 로컬 자정으로 `오늘`·`어제`를 가른다(정각은 `오늘`, 1ms 전은 `어제`). 구간 제목 문구는 ko/en 번역.
- 비목표: 표 그리기·정렬 적용(2/3), 문서(3/3), 새 단축키·액션, 다른 속성 그룹핑, 접기/펼치기.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음.
- 설정 키 체크리스트(AGENTS.md): `td-config` 구조체(`crates/td-config/src/config.rs`의 `BehaviorTable`) + `default.toml` → `task gen-types` → `ui/Settings.tsx` `SECTIONS`(점 표기 키) → 설정 탭 목록 테스트.
- 정의 완료(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/date-groups.test.ts` 통과(작성 시점: 파일 없음 → 앞으로 향하는 확인). 테스트는 고정된 `now`(`vi.setSystemTime`)에서 구간 7종과 자정 경계, 최신 구간이 위인 순서를 단언한다.
  2. `grep -cE '오늘|어제|이전 7일|이전 30일|6월|2025|날짜 없음' apps/desktop/src/__tests__/date-groups.test.ts` ≥ 7(작성 시점: 파일 없음).
  3. `grep -c 'group_by_modified = false' crates/td-config/src/default.toml` ≥ 1, `grep -c group_by_modified apps/desktop/src/ui/Settings.tsx` ≥ 1(작성 시점 둘 다 0).
  4. `cargo test -p twin-deck-desktop up_to_date` 통과 — 바인딩·`default-config.json`이 최신(작성 시점에 통과 중인 회귀 방어).
  5. `cargo test -p td-config`, `cargo clippy -p td-config -- -D warnings`, `cargo fmt --check` 통과.
  6. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 전체 통과(병렬 간헐 실패는 단독 재실행으로 통과하면 인정).

## 작업 조각
- [ ] S1. `BehaviorTable`에 `group_by_modified: bool`을 더하고 `default.toml`에 `group_by_modified = false`(한글 주석)를 쓴 뒤 `task gen-types`로 바인딩·`default-config.json`을 다시 만든다. — 완료 기준: DoD 3(첫 줄)·4·5.
- [ ] S2. `lib/dateGroups.ts`: `(modifiedMs: number | null, now: number)`로 구간(식별자·정렬 순위·표시 제목)을 돌려주는 순수 함수와 테스트 `date-groups.test.ts`. 제목은 i18n(ko/en)을 쓴다. — 완료 기준: DoD 1·2. (depends: S1)
- [ ] S3. `ui/Settings.tsx` `SECTIONS`(모양)에 스위치를 더하고 i18n 문구(ko/en)를 쓰고 설정 탭 목록 테스트를 맞춘다. FakeBackend 기본 설정도 맞춘다. — 완료 기준: DoD 3(둘째 줄)·6. (depends: S1)
