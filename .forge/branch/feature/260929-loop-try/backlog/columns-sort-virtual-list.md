<!-- forge-slug: columns-sort-virtual-list -->
<!-- task: 14 -->
<!-- priority: medium -->
<!-- tdd: off -->
# 컬럼 명세, 정렬, 표시 모드(다중 컬럼), 가상 스크롤

## Goal / Non-goals
- Goal: CFG-06/07/08, NAV-02/05, 그리고 "10만 항목에서 UI가 멈추지 않는다". 컬럼 명세 `[<|>]이름[:너비]` 파서(Rust `columns_spec_parse`와 TS 대응), 컬럼(name/size/created/modified/added/extension/권한 2종)과 설정 기반 날짜·크기 포맷, 정렬(`core.view.order` 액션, 헤더 키 없이 액션 인수; 이름/크기/수정일/확장자, 오름/내림, 폴더 먼저), 표시 모드 Table과 다중 컬럼 1~3(`core.view.mode`, 좌/우 키로 컬럼 이동 NAV-05, `Alt+PageUp/PageDown` 반 페이지 NAV-02, 패널·탭별 저장), 목록 가상 스크롤(`@tanstack/react-virtual`).
- Non-goals: 컬럼 너비 드래그 조절, 헤더 클릭 정렬 UI 세부, 사용자 정의 컬럼.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0007
- Definition of Done: `cargo test` 이름 지정 테스트 `columns_spec_parse`(정상/오류/너비/정렬 방향 접두) 통과, 정렬 규칙 단위 테스트, 10만 항목을 입력으로 목록 조회+정렬을 수행하는 `large_dir_100k_list`(tempdir에 실제 100_000개 파일 생성, 소요 시간을 출력하고 시간 측정은 `docs/m2-benchmark.md` 태스크가 기록). `columns-sort.test.tsx`(컬럼 렌더, 정렬 액션, 모드 전환, 좌/우 이동, 반 페이지 이동) 및 `virtual-list.test.tsx`(10만 항목에서 렌더되는 행 DOM이 상한(예: 200) 이하이고, 끝으로 이동해도 커서 행이 렌더됨, aria-rowcount 유지) 통과. M1 목록 테스트 유지.

## Work slices
- [ ] S1. 컬럼 명세 파서와 정렬 규칙(Rust+TS) — completion criterion: `columns_spec_parse` 및 TS 파서 테스트 통과
- [ ] S2. `large_dir_100k_list` — completion criterion: 통과, 소요 시간 출력 (depends: S1)
- [ ] S3. 컬럼 렌더와 포맷, 정렬 액션 — completion criterion: columns-sort.test.tsx 해당 케이스 통과 (depends: S1)
- [ ] S4. 다중 컬럼 모드와 이동 키 — completion criterion: 해당 케이스 통과 (depends: S3)
- [ ] S5. 가상 스크롤 — completion criterion: virtual-list.test.tsx 통과 (depends: S3)
