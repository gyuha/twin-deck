# Run — lookup-engine (#24)

## 결과
- 새 crate `td-search`: 질의 파서(`parse`), 조건 평가, 라이브 순회 `walk`/`search`(콜백 스트리밍, `CancelToken`), 스레드 검색 `spawn`(채널 스트리밍, 핸들을 버리면 취소 후 join).
- 질의: 이름만 입력(부분 일치), 간단 조건 14종, `변수 연산자 인수`(Name/Content/Size/Modified/Created/Kind), AND 결합(`and`/`AND`/`&&`), 연산자 12종과 별칭을 하나의 `Op`로 정규화. 문법 오류는 바이트 위치와 함께 반환. 지원하지 않는 변수·종류(UTI, Author, Application, Bundle …)는 오류가 아닌 경고이며 순회하지 않는다.
- `Vfs::read_head(path, max)` 추가(LocalFs, CompositeFs). 그래서 Content 조건과 순회가 아카이브 안(`x.zip!`)에서도 같은 코드로 동작한다.
- ADR-0013에 문법과 확인하지 못한 가정을 기록: `like`/`~=`는 glob, 텍스트는 NFC+대소문자 무시, Size는 1024 배수, 날짜는 UTC, Content는 1 MiB 이하 텍스트 파일만, 심볼릭 링크는 따라가지 않음.
- 테스트(`cargo test -p td-search`, 6개): `lookup_query_parse`, `lookup_operator_aliases`, `lookup_live_search`(tempdir 트리, 이름·종류·크기·날짜·Content, 숨김 포함, 채널 스트리밍), `lookup_cancel`(2,040개 트리에서 첫 결과에 취소하면 방문 수가 절반 미만, 취소 뒤 콜백 0), `lookup_unsupported_variable_warns`, `lookup_inside_archive`. 변형 검사: 항목별 취소 검사를 지우면 `lookup_cancel`, Content의 NUL 제외를 지우면 `lookup_live_search`가 실패한다.

## 계획과 다른 점
- 크기·날짜에 `<`, `<=`, `>`, `>=`를 추가했다(계획의 연산자 목록에는 없지만 크기·날짜 조건에 필요). ADR-0013에 확장으로 표시했다.
- 순회는 walkdir 대신 `Vfs` 재귀(list)로 구현했다. 아카이브 안 검색을 같은 코드로 하기 위해서다.
- 생성일(Created) 조건은 파일시스템이 생성 시각을 주는 경우에만 동작하고, 테스트에서는 값을 지정할 수 없어 범위 비교(먼 미래/과거)로만 확인했다.

## 한계
- Look Up의 UI(전역/현재 폴더 진입점, 가상 탭)는 다음 태스크(virtual-tabs-ui)에서 연결한다. 이 태스크는 엔진만 다룬다.
- Spotlight 백엔드, OR/괄호, 정규식은 범위 밖. Application/Bundle은 라이브 순회에서 판별하지 않는다.
