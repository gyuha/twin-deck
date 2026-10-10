# run — `..` 상위 폴더 행 옵션 (이슈 #44)

fg-run이 워크플로 없이 직접 실행했다.

## 슬라이스별 결과
- S1 설정: `behavior.table.show_parent_row`(기본 false) + `task gen-types`, 설정 화면 항목, ko/en 문구 — ✅ as planned
- S2 스토어: 커서 `-1`을 `..` 행으로 쓰고 이동·순환·Shift 범위·`setCursor`·`open` 가드 — ⚠ 계획에 없던 `ActionContext.onParentRow`(선택 필드)를 `packages/actions`에 더했다. `core.open`이 `hasCursorItem`으로 막혀 `..`에서 Return이 동작하지 않았기 때문이다
- S3 `FileTable.tsx`: 맨 위에 고정하지 않고 목록 스크롤 영역의 첫 행으로 그린다(스크롤하면 위로 사라진다). 가상 스크롤은 `scrollMargin`으로 그 높이만큼 비운다 — ⚠ "맨 위 고정" 대신 일반 첫 행. 배경색 토큰을 확인할 수 없어 sticky를 쓰지 않았다
- S4 테스트 `parent-row.test.tsx` 11건, 문서(`07-ui-spec`, `06-config-plugins`) — ✅ as planned

## DoD baseline → after
1. `cargo test -p td-config` 통과(새 테스트 `show_parent_row_defaults_off…` 포함, 36건), `up_to_date` 통과
2. `-t "상위 행"` 통과(가상 탭·루트·꺼짐·켜짐·Return·더블클릭 포함)
3. `-t "예외"` 통과 5건(전체선택 복사·이동 개수와 결과, 경로 복사, 커서가 `..`일 때 F5·F6·F8·F2·Mod+F12 무반응, Space 토글·상태 표시줄 개수)
4. vitest 전체 1129 통과, 실패는 기준선 `pdf-preview` + `model-formats` 파일 로드뿐 / `tsc`·`clippy -p td-config`·`fmt --check` 통과 / ko·en 키 일치 / `packages/actions` 19건 통과
5. `grep -c show_parent_row docs/07-ui-spec.md` 1

## 어긋난 점
- 이슈 이미지는 볼 수 없어(첨부 URL) 위치는 요청 문구("파일 목록 최상단")를 따랐다.
- 드래그로 `..` 행에 놓기는 만들지도 검증하지도 않았다(`..` 행에는 마우스다운 드래그 시작이 없고 놓기 대상 표시도 없다).
- 우클릭 컨텍스트 메뉴는 `..`에 없다.
- 실제 WKWebView 화면 확인은 하지 않았다.
