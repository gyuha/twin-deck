<!-- forge-slug: date-group-3of3 -->
<!-- task: 157 -->
<!-- part: 3/3 -->
<!-- tdd: off -->
<!-- retro-hint: optional -->
# 날짜 구간 그룹핑 3/3: 문서 반영과 최종 점검 (이슈 #62)

## 목표 / 비목표
- 목표: 새 설정 `behavior.table.group_by_modified`와 동작을 `docs/06-config-plugins.md`(설정 설명)와 `docs/07-ui-spec.md`(목록 화면 설명)에 적고, 구동 전체의 정지 조건 검사(C1~C6)가 모두 통과하는지 확인한다.
- 비목표: 코드 변경(문서만), `CHANGELOG.md`·버전·배포, README 변경.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음. 선행: 1/3·2/3(소프트 순서).
- 정의 완료(DoD):
  1. `grep -c group_by_modified docs/06-config-plugins.md docs/07-ui-spec.md` 파일마다 ≥ 1(작성 시점 둘 다 0 → 앞으로 향하는 확인).
  2. 문서가 구간 규칙(`오늘`·`어제`·`이전 7일`·`이전 30일`·월별·연도별·`날짜 없음`), 기본 꺼짐, 적용 대상(단일 컬럼 목록 보기, 여러 열 보기·가상 탭 제외)을 말한다: `grep -c '이전 7일' docs/07-ui-spec.md` ≥ 1(작성 시점 0).
  3. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 전체 통과(문서만 바꾸므로 이미 통과 중이어야 하는 회귀 방어).

## 작업 조각
- [ ] S1. `docs/06-config-plugins.md`의 `behavior.table` 설정 설명에 키와 기본값·동작을 더한다. — 완료 기준: DoD 1(06).
- [ ] S2. `docs/07-ui-spec.md`의 목록 화면 표에 날짜 구간 그룹핑 항목을 더한다. — 완료 기준: DoD 1(07)·2. (depends: S1)
- [ ] S3. DoD 3과 정지 조건 C1~C6 전체를 한 번 돌려 결과를 기록한다. — 완료 기준: DoD 3. (depends: S2)
