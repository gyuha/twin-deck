# 실행 기록 — 날짜 구간 그룹핑 1/3: 설정 키·구간 계산·설정 스위치 (이슈 #62)

fg-loop 구동 중 직접 실행했다(tdd off).

## 슬라이스별 결과
- S1 설정 키 `behavior.table.group_by_modified`(기본 꺼짐) + `task gen-types` — ✅ 계획대로. 같은 모양의 Rust 테스트 `group_by_modified_defaults_off_and_user_can_turn_it_on`도 더했다.
- S2 `lib/dateGroups.ts` + `date-groups.test.ts` — ✅ 계획대로(테스트 10건).
- S3 설정 스위치·i18n — ⚠ 첫 시도에서 `group.month_name`의 자리표시자가 ko `{month}`·en `{name}`으로 달라 `i18n-keys.test`가 실패했다. 두 언어 모두 `{name}`(한국어 월 이름은 `Intl`이 `6월`로 만든다)으로 통일해 고쳤다.

## DoD baseline → after
1. `date-groups.test.ts`: 파일 없음 → 10 passed.
2. 구간 grep: 파일 없음 → 17줄(≥7).
3. `group_by_modified = false` default.toml 0 → 1, Settings.tsx 0 → 1.
4. `up_to_date`: 2 passed → 2 passed(회귀 방어, 이미 통과).
5. td-config 46 passed, clippy·`fmt --check` 통과.
6. `tsc` 통과, vitest 전체 1314건 통과(157 파일).

## 계획과 다른 점
- 없음(위 S3의 자리표시자 수정 외).
