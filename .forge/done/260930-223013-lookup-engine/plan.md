<!-- forge-slug: lookup-engine -->
<!-- task: 38 -->
<!-- priority: medium -->
<!-- tdd: off -->
# td-search: Look Up 질의 파서와 라이브 순회 검색

## Goal / Non-goals
- Goal: 새 crate `td-search`. docs/08 §5대로 (1) 질의 파서: 이름만 입력(부분 일치), 간단 조건(Folder, File, Archive, Disk Image, Text, RTF, HTML, XML, Source Code, Image, Video, Audio, Executable, Application, Bundle, ZIP — 확장자/MIME 판별, OS 의존 항목은 미지원 경고), 복합 조건 `변수 연산자 인수`(Name, Content, Size, Modified(수정일), Created(생성일), 종류) 그리고 조건 결합(AND), 연산자와 별칭(`=` `==` `is` `equals` / `!=` `isNot` / `contains` `has` / `like` `~=` / `startsWith` / `endsWith`)을 그대로 수용, (2) 라이브 순회 검색(walkdir 또는 Vfs 재귀, `.gitignore` 무시 안 함): 결과를 스트리밍(콜백/채널)으로 내보내고 **취소**할 수 있으며, Content는 텍스트 파일만 크기 상한 안에서, (3) 지원하지 않는 변수(UTI, Author, Title, Album, Genre 등)는 오류 없이 "이 백엔드에서 지원하지 않음" 경고를 결과와 함께 돌려준다. `like`/`~=`의 의미는 확인되지 않았으므로 와일드카드(glob) 일치로 가정하고 그 사실을 문서에 기록한다.
- Non-goals: UI, Spotlight(mdfind) 백엔드, 인덱스, 정규식 방언.

## Source of truth
- Glossary terms: Look Up
- Related ADRs: docs/adr/0004 (인덱스 없음)
- Definition of Done: `cargo test -p td-search` 통과: `lookup_query_parse`(간단/복합/이름만/따옴표 인수/결합/오류 위치), `lookup_operator_aliases`(모든 별칭이 같은 의미로 정규화), `lookup_live_search`(tempdir 트리에서 이름·크기·날짜·종류·Content 조건 결과 정확, 숨김 파일 포함, 결과가 스트리밍으로 도착), `lookup_cancel`(취소하면 남은 순회를 멈추고 이후 결과가 오지 않음 — 큰 트리에서 취소 후 방문 수가 전체보다 적음), `lookup_unsupported_variable_warns`(UTI 등 → 결과는 비고 경고 있음, 오류 아님). 테스트는 tempdir만 사용.

## Work slices
- [ ] S1. 질의 파서와 정규화(연산자 별칭) — completion criterion: `lookup_query_parse`, `lookup_operator_aliases` 통과
- [ ] S2. 조건 평가(이름/크기/날짜/종류/Content)와 지원 여부 경고 — completion criterion: `lookup_unsupported_variable_warns` 통과 (depends: S1)
- [ ] S3. 스트리밍 순회와 취소 — completion criterion: `lookup_live_search`, `lookup_cancel` 통과 (depends: S2)
