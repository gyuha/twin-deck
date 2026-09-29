# RUN — columns-sort-virtual-list
- S1 컬럼 명세 파서와 정렬 규칙 — ✅ Rust `td_config::parse_column`/`normalize_columns`(설정 로딩에서 잘못된 항목을 경고하고 빼며 name을 앞에 보장), TS `parseColumn(s)`; 같은 규칙을 양쪽 테스트가 검증. `columns_spec_parse`
  - 가정 `[낮음]`: `<`=오름차순, `>`=내림차순. docs/06에 방향 의미가 적혀 있지 않다.
- S2 `large_dir_100k_list` — ✅ tempdir에 실제 100_000개(폴더 1%) 생성 후 목록+정렬, 폴더 먼저·이름순 정확성 검사, 시간은 stderr에 출력(디버그 빌드에서 테스트 전체 약 20초 — 대부분 파일 생성). 측정/판정은 m2-benchmark-status 태스크가 릴리스 빌드로 기록.
- S3 컬럼 렌더, 포맷, 정렬 액션 — ✅ 컬럼: name/size/created/modified/extension/permissions/permissions_octal. `added`는 파일시스템에서 얻을 수 없어 "—" 표시(macOS Date Added는 Spotlight 메타데이터). 크기 포맷 adaptive/adaptive_kibi/bytes/KB…/KiB…, 날짜는 strftime 부분집합 + 오늘/어제 상대 표기. `core.view.order`(인수 by/dir, 같은 키 재입력 시 방향 토글, 폴더 항상 먼저, 값 없는 항목은 방향과 무관하게 끝). 탭별 정렬, 정렬 후 커서 유지, 머리글 클릭. 기본 키는 자체 정의(Alt+Shift+N/S/M/C/E).
- S4 다중 컬럼 — ✅ `core.view.mode`(table/columns-1..3, 인수 없으면 순환), 열 우선 배치, Left/Right 컬럼 이동(NAV-05), Alt+PageUp/Down 반 페이지(NAV-02, 5행). 기본 키는 자체 정의(Mod+Alt+0..3).
- S5 가상 스크롤 — ✅ `@tanstack/react-virtual`. 10만 항목에서 DOM 행 ≤ 200(3열 ≤ 600), End/Home/PageDown 후 커서 행 렌더, 전체 선택 10만.
⚠ 검증 한계: 가상 스크롤 테스트는 jsdom 레이아웃 shim(test-setup.ts: clientHeight 480, scrollHeight=첫 자식 높이)과 `scrollToFn` 보강 위에서 돈다. 실제 브라우저/웹뷰의 스크롤·측정은 검증하지 못했다(특히 WebKitGTK).
⚠ 발견·수정한 문제: (1) 초기화 순서 — 설정을 읽기 전에 첫 목록을 정렬해서 컬럼 명세의 정렬 표시가 무시됨 → init에서 설정을 먼저 읽도록 수정, 설정이 바뀌면 재정렬. (2) react-virtual이 이펙트 안에서 flushSync를 호출 → useFlushSync:false.
⚠ 미구현: 컬럼 너비 드래그 조절, 사용자 정의 컬럼, 권한 컬럼 정렬.
DoD: td-config 7, td-vfs 5(large_dir 포함), desktop vitest 98+ (columns-sort 14, virtual-list 3, lib 21).

⚠ 신뢰성 발견(td-config): 봉인 게이트에서 `config_watch_reload`가 타임아웃으로 실패했고, 단독 반복 실행에서 15회 중 7회 실패했다(다른 때는 25회 연속 통과). 이전 태스크(td-config) 봉인 때부터 있던 간헐 결함이다. 파일 이벤트가 늦거나 유실되는 것으로 보이지만 근본 원인은 식별하지 못했다(10만 파일 테스트 직후·파일 시스템 부하 상황에서는 재현되지 않았다). 대응: `ConfigStore`에 1초 주기 폴링 폴백(두 설정 파일의 mtime/크기 비교)을 추가해 이벤트 유실과 무관하게 반영되게 함. 폴백 추가 후 스위트 25회 반복 실패 0. `td-watch`(목록 갱신)에도 같은 위험이 있을 수 있으나 이번에는 손대지 않았다.
