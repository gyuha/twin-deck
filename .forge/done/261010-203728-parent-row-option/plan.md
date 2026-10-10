<!-- forge-slug: parent-row-option -->
<!-- task: 131 -->
<!-- tdd: off -->
# 파일 목록 맨 위에 상위 폴더 `..` 행을 보이는 옵션을 더한다

## 목표 / 하지 않을 것
- 목표: 설정 `behavior.table.show_parent_row`(기본 꺼짐)를 켜면 파일 목록 맨 위에 `..` 행이 보인다. `..`에서 `Return`·더블클릭하면 상위 폴더로 간다. (GitHub 이슈 #44)
  - 과거 결정: 이슈 #22(task #84, `remove-parent-folder-row`)에서 목록 위 `..` 버튼 줄을 지웠고 "숨김·표시 설정은 만들지 않는다"고 했다. 이번 요청이 그것을 옵션으로 되돌린다(켜야 보이고 기본은 꺼짐이라 기존 사용자는 그대로).
  - 구현: `..`는 `tab.entries`에 넣지 않고 커서 위치 `-1`로 둔다(이름이 `..`인 파일은 만들 수 없지만 entries에 넣으면 모든 소비처를 고쳐야 한다). 그래서 `targetsOf`·`cursorEntry`가 `..`를 자연히 대상에서 제외한다 → **예외 처리**: 전체 선택(`Ctrl+A`) 뒤 복사·이동, 파일/폴더 경로 복사, 삭제·이름 바꾸기 등 모든 작업 대상에 `..`가 들지 않고, 커서가 `..`이고 선택이 없으면 그 작업들은 대상이 없어 아무 일도 하지 않는다. 선택 반전·범위 선택·`Space` 토글도 `..`를 건너뛴다.
  - `..`는 폴더에 들어가거나 새로 열었을 때 커서가 놓이는 자리가 아니다: 커서는 첫 실제 항목(0)이다. `..`는 `↑`로 간다.
  - 표시 조건: 옵션이 켜져 있고, 가상 탭(검색·Disk Usage)이 아니며, 상위 폴더가 있다(루트에서는 없음). 아카이브 루트의 `..`는 기존 `goUp`과 같이 아카이브가 든 폴더로 나간다.
  - 끌기는 `..`에서 시작하지 않는다. `..` 행에 놓기는 이번 범위에서 따로 만들거나 검증하지 않는다.
- 하지 않을 것: Rust 바인딩 타입 변경(설정 필드 하나만 더한다) · `..` 행 컨텍스트 메뉴 · `..` 위 드롭 · `Backspace`·`Alt+↑`·`←` 동작 변경 · 가상 탭의 `..`
- 변경 파일 예상: `crates/td-config/src/{config.rs,default.toml}`, 생성물(`task gen-types`), `apps/desktop/src/state/store.ts`, `ui/FileTable.tsx`, `ui/Settings.tsx`, `i18n/{ko,en}.ts`, 테스트, `docs/07-ui-spec.md`

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음
- 관련 ADR: 없음
- 이슈 추적: GitHub 이슈 #44
- 완료 정의(DoD) = `.forge/loop.md`의 C1~C5
  1. 설정: `cargo test -p td-config` 통과(기본 꺼짐 단언 포함), `task gen-types` 뒤 `cargo test -p twin-deck-desktop up_to_date` 통과 (사전 상태: 필드가 없어 단언 테스트 없음 — 앞으로 가는 확인)
  2. 표시: `bunx vitest run src/__tests__/parent-row.test.tsx -t "상위 행"` 통과 ≥ 4 (사전 상태: 파일 없음)
  3. 예외: `-t "예외"` 통과 ≥ 4 (사전 상태: 파일 없음)
  4. 회귀 방지(이미 통과 중): vitest 전체 기준선 소음만, `tsc`·`clippy -p td-config`·`cargo fmt --check` 통과, ko/en 키 일치
  5. 문서: `grep -c "show_parent_row" docs/07-ui-spec.md` ≥ 1 (사전 상태: 0)

## 작업 조각
- [ ] S1. 설정 필드 `behavior.table.show_parent_row`(기본 false) + `task gen-types`, 설정 화면 항목과 ko/en 문구. — 완료 기준: DoD 1, 4
- [ ] S2. 스토어: 커서 `-1`(`..`) 이동·순환·선택 계열 가드, `open`이 `..`에서 상위로 간다. (depends: S1) — 완료 기준: DoD 2, 3
- [ ] S3. `FileTable.tsx`: `..` 행을 맨 위에 고정해 그리고 클릭·더블클릭·활성 표시를 처리한다. (depends: S2) — 완료 기준: DoD 2
- [ ] S4. 테스트 `parent-row.test.tsx` + 문서. (depends: S3) — 완료 기준: DoD 2, 3, 5
