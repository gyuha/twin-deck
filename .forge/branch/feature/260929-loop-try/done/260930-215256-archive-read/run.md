# RUN — archive-read
- S1 경로 표기 — ✅ ADR-0012(`아카이브!/안/경로`, 중첩은 `!/` 반복). `split_archive_path`: `!/` 앞의 마지막 요소가 아카이브 확장자이고 **바깥 아카이브는 실제 파일**이어야 경계로 본다(이름에 `!/`가 든 실제 폴더와 구분). 확장자 판별 `kind_for_name`(zip 계열 + 설정 추가 확장자, tar/tar.gz/tgz/tar.bz2; **rar는 지원하지 않음**).
- S2 ZIP 읽기 — ✅ 목록(암묵적 폴더 합성)/stat/read_to(스트리밍)/`open_nested`(임시 파일로 꺼내 다시 엶). **시스템 `zip`이 만든 파일을 읽는 테스트**(`zip_read_external_zip_cli`).
- S3 tar 계열 — ✅ **시스템 `tar`가 만든** tar.gz/tgz/tar.bz2/tar 읽기(`tar_gz_read`).
- S4 중첩 — ✅ zip 안의 zip 안의 zip, tar.gz 안의 zip.
- S5 안전 추출 — ✅ `extract_all`은 **쓰기 전에 모든 항목을 먼저 검사**(`..`, 절대 경로, `\`를 구분자로 본 `..`, 드라이브 경로, 널 문자, 심볼릭 링크/특수 파일)하고 하나라도 위험하면 아무것도 쓰지 않는다. 이미 있는 파일은 덮어쓰지 않는다. `zip_slip_rejected`는 라이브러리가 이름을 정리해 주지 못하게 **zip 바이트를 직접 조립**해서 악성 zip을 만든다(조립기가 올바른 zip을 만드는지는 시스템 `unzip -t`로 따로 검증: `raw_zip_builder_makes_valid_zips`). 검사 함수의 `..` 판정을 지우면 이 테스트가 실패함을 확인하고 복원.
- 테스트/검증이 잡은 것(모두 고침):
  1. macOS `zip`은 한글 이름을 UTF-8 바이트로 저장하면서 UTF-8 플래그(bit 11)를 켜지 않는다. `zip` crate는 이를 CP437로 해석해 `φò£Ω╕Ç` 같은 깨진 이름이 된다 → 원본 이름 바이트가 유효한 UTF-8이면 UTF-8로 읽는다(`zip_name`). macOS에서 만든 zip이 흔하니 필수 호환성이다.
  2. 조회는 NFC/NFD를 구분하지 않는다(macOS는 NFD를 쓴다). 돌려주는 이름은 저장된 그대로.
  3. `clean()`이 앞의 `/`를 지워서 절대 경로 항목이 상대 경로로 둔갑해 추출됐다(zip-slip 테스트가 잡음) → 앞의 `/`는 지우지 않고 검사에서 거부.
  4. `zip` crate의 `start_file`이 `../` 같은 이름을 정리해서 악성 zip을 만들 수 없었다 → 바이트 직접 조립.
  5. macOS `tar`가 `._*` 메타데이터 항목을 끼워 넣는다 → 테스트에서 `COPYFILE_DISABLE=1`.
⚠ 한계: 항목 목록은 열 때 한 번 메모리에 올린다(수백만 항목의 아카이브는 미검증). tar 계열은 무작위 접근이 없어 read_to가 처음부터 훑는다. 암호화 zip, zip64 대용량, 손상된 아카이브의 부분 복구는 다루지 않았다. 외부 도구는 macOS의 `zip`/`unzip`/`tar`(bsdtar)만 확인했다(GNU tar/Info-ZIP 차이 미확인).
DoD: cargo test -p td-archive 7 passed.
