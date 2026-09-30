# ADR-0013. Look Up 질의 문법과 확인하지 못한 부분의 가정

- 상태: Accepted
- 날짜: 2026-09-30

## 맥락

Look Up(FIND-01~04)은 Marta의 질의 형식을 따라야 하지만, Marta의 이름 입력 규칙과 `like`/`~=`의 의미, 전역 범위는 문서에서 확인하지 못했다([08 §9](../08-vfs-file-ops.md)). Marta는 Spotlight를 쓰고, twin-deck은 3개 OS에서 같게 동작해야 하므로 라이브 순회 검색(`td-search`)이 기본 백엔드다.

## 결정

질의는 `조건 (AND 조건)*`이다. 결합은 `and`, `AND`, `&&`이며 OR와 괄호는 없다. 따옴표(`"…"`, `'…'`) 안의 `and`는 결합이 아니다. 조건 하나는 아래 셋 중 하나로 읽는다(위에서부터 시도).

1. **복합 조건** `변수 연산자 인수`: 첫 토큰이 단어이고 둘째 토큰이 연산자면. 인수가 여러 단어면 원문 그대로 이어 붙인다(`Name contains hello world` → `hello world`). 기호 연산자는 공백 없이도 읽는다(`Size>10KB`, `Name=a.txt`).
2. **간단 조건**: 조건 전체가 종류 이름이면(대소문자·공백 무시): Folder, File, Archive, Disk Image, Text, RTF, HTML, XML, Source Code, Image, Video, Audio, Executable, ZIP.
3. **이름만 입력**: 그 밖에는 조건 전체를 **이름 부분 일치**로 본다(대소문자 무시).

연산자와 별칭(단어는 대소문자 무시): `=` `==` `is` `equals` / `!=` `isNot` / `contains` `has` / `like` `~=` / `startsWith` / `endsWith`. 크기와 날짜에는 `<` `<=` `>` `>=`를 더했다(Marta 문서에서 확인하지 못한 확장).

변수: `Name`, `Content`, `Size`, `Modified`, `Created`, `Kind`(한글 별칭 이름·내용·크기·수정일·생성일·종류). 그 밖의 변수(UTI, Author, Title, Album, Genre 등)와 종류 Application, Bundle은 **오류가 아니라 "이 백엔드에서 지원하지 않음" 경고**로 처리한다. 지원하지 않는 조건이 하나라도 있으면 AND 결과는 항상 비므로 순회하지 않고 경고만 돌려준다.

### 가정 (Marta 실행으로 확인하기 전까지)

| 항목 | 가정 |
|---|---|
| `like`, `~=` | **glob** 일치(`*`, `?`, `[abc]`; Select Group과 같은 구현, NFC·대소문자 무시). 정규식이 아니다 |
| 텍스트 비교 | NFC 정규화 후 대소문자 무시 |
| 이름만 입력 | 이름 부분 일치. 여러 단어는 하나의 문자열로 본다 |
| Size 단위 | `B`, `K/KB/KiB`, `M/MB/MiB`, `G/GB/GiB`, `T/TB/TiB` 모두 1024 배수 |
| 날짜 | UTC 기준. `2026-09-01`(하루 구간), `2026-09-01 10:30[:SS]`(그 시각), `today`, `yesterday`, `7d`/`12h`/`2w`(지금부터 그만큼 전 시각). 날짜만 쓴 `=`는 그날 전체, `>`는 그날이 끝난 뒤 |
| Content | 텍스트 파일만: 크기 상한(기본 1 MiB) 이하이고 앞부분에 NUL이 없는 파일. 상한을 넘거나 이진이면 본문 조건에서 제외(오류 아님) |
| 종류 판별 | 확장자와 유닉스 실행 권한 비트로만 판별(내용을 열지 않는다). Text는 일반 텍스트 확장자, 소스는 Source Code로 따로 둔다 |
| 순회 | 숨김 파일 포함, `.gitignore` 무시 안 함, 심볼릭 링크는 따라가지 않음 |

## 결과

- 확인되지 않은 규칙이 문서와 테스트(`lookup_query_parse`, `lookup_operator_aliases`)에 고정되어, 나중에 Marta와 다르다는 것이 확인되면 이 표와 테스트를 함께 고친다.
- 오류는 입력 문자열의 바이트 위치와 함께 돌려주므로 UI가 위치를 표시할 수 있다.
- OR, 괄호, 정규식, Spotlight(mdfind) 백엔드는 범위 밖이다.
