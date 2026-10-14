<!-- forge-slug: group-toggle-button -->
<!-- task: 161 -->
<!-- tdd: off -->
# 상태 표시줄에 "묶어보기" 토글 버튼 추가 (이슈 #69)

## 목표 / 비목표
- 목표: 상태 표시줄(`apps/desktop/src/App.tsx`의 `<footer role="status">`)의 `숨김 파일` 버튼 바로 오른쪽에 `묶어보기`(영어 `Group`) 토글 버튼을 둔다. 누르면 설정 `behavior.table.group_by_modified`를 켜고 끈다(설정 화면의 "수정일로 묶어 보기" 스위치와 같은 값). 접근성 이름은 "수정일로 묶어 보기"(영어 "Group by date modified"), 켜짐은 `aria-pressed`와 글자 색(기존 `viewToggle`이 처리)으로 보인다.
- 구현 힌트: 기존 `viewToggle(label, text, on, toggle, actionId)`를 재사용한다. `숨김 파일`은 `showHidden`·`api.toggleHidden()`, 드라이브 바·Action Bar는 `api.toggleLayoutFlag(...)`(`behavior.layout.*` 전용)을 쓴다. 이 설정은 `behavior.table.group_by_modified`라서 `state/store.ts`에 같은 모양의 토글 함수(`toggleGroupByModified` 등)를 더해 `api.setConfigValue("behavior.table.group_by_modified", { kind: "bool", value: … })`로 저장한다. 새 액션이 없으므로 `viewToggle`의 `actionId` 자리에는 키가 없는 것으로 처리되게 한다(키 없이 title만).
- 비목표: 새 액션·단축키·메뉴, 다른 속성 그룹핑, 버튼 순서 설정, Rust·설정 스키마 변경.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음.
- 정의 완료(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/group-toggle-button.test.tsx` 통과(작성 시점: 파일 없음 → 앞으로 향하는 확인). 테스트는 (a) 이름 "수정일로 묶어 보기"·글자 "묶어보기" 버튼이 `숨김 파일 표시` 버튼의 바로 다음 형제이고, (b) 기본 `aria-pressed="false"`, 누르면 `"true"`가 되고 `behavior.table.group_by_modified`가 저장되며 목록에 `[data-group-header]`가 생기고, 다시 누르면 꺼지고 사라지며, (c) 설정이 켜져 있으면 처음부터 눌려 있고, (d) 영어에서는 "Group"·"Group by date modified"임을 단언한다.
  2. `grep -c 'status.group' apps/desktop/src/i18n/ko.ts apps/desktop/src/i18n/en.ts` 파일마다 ≥ 2(작성 시점 0·0 → 앞으로 향하는 확인).
  3. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 전체 통과(작성 시점에 통과 중인 회귀 방어; `app-status-buttons`·`i18n-keys`·`settings` 포함, 병렬 간헐 실패는 단독 재실행으로 통과하면 인정).
  4. `grep -c '묶어보기' docs/07-ui-spec.md` ≥ 1(작성 시점 0 → 앞으로 향하는 확인). `docs/07-ui-spec.md` 35행 부근의 "상태 표시줄 오른쪽 끝에 … 보기 토글(숨김 파일·Drive Bar·Action Bar)" 문장에 새 버튼을 적는다.
  5. `cargo test -p twin-deck-desktop up_to_date`와 `cargo clippy -p td-config -- -D warnings` 통과(Rust·설정 스키마를 바꾸지 않는다는 회귀 방어, 작성 시점에 통과 중).
  - 이 DoD는 실제 앱에서의 겉모양(간격·켜짐 색)을 증명하지 못한다. 사람이 눈으로 확인해야 한다.

## 작업 조각
- [ ] S1. `state/store.ts`에 `behavior.table.group_by_modified`를 뒤집어 저장하는 토글 함수를 더한다. — 완료 기준: 호출하면 설정 값이 바뀌고 목록이 다시 정렬된다(DoD 1의 (b)).
- [ ] S2. `App.tsx`의 상태 표시줄 `숨김 파일` 버튼 바로 뒤에 `viewToggle`로 `묶어보기` 버튼을 더하고, ko/en 문구(`status.group`·`status.group_aria`)를 쓴다. 새 액션이 없으므로 키 없는 title이 되게 한다. — 완료 기준: DoD 1의 (a)(c)(d), DoD 2. (depends: S1)
- [ ] S3. 테스트 `group-toggle-button.test.tsx`를 쓴다. — 완료 기준: DoD 1. (depends: S2)
- [ ] S4. `docs/07-ui-spec.md`에 새 버튼을 적고 전체 검증을 돌린다. — 완료 기준: DoD 3·4·5. (depends: S3)
