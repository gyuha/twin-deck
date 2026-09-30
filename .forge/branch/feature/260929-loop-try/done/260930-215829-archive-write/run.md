# Run — archive-write (#21)

## 결과
- `td-archive`에 ZIP 쓰기(`ZipEdit`: 추가·삭제·이름 변경·폴더, 임시 파일 후 원자적 교체)와 중첩 되쓰기(`edit_in`)를 추가했다.
- tar 계열 쓰기는 `ArchiveError::ReadOnly`로 거부한다.
- 테스트 5개(`zip_write_roundtrip_unzip_t`, `zip_write_edits_zip_made_by_another_tool`, `zip_write_failure_keeps_original`, `archive_nested_write_back`, `archive_readonly_errors`)가 통과했다. 15회 반복해도 불안정하지 않았다.

## 계획과 다른 점 / 발견
- macOS `zip`은 한글 이름을 UTF-8 플래그 없이 저장한다. 기존 항목을 그대로 복사(`raw_copy_file`)하면 이름이 영구히 깨졌다. 그래서 디코딩된 이름이 다른 항목은 올바른 이름으로 다시 써서(`raw_copy_file_rename`) 복구한다.
- 검증 도구 한계: macOS 구형 `unzip -Z1`은 비ASCII 이름을 깨뜨리고 bsdtar는 NFD로 돌려준다. 이름과 내용은 bsdtar로 읽고 NFC로 정규화해 비교하며, 무결성은 `unzip -tq`로 본다.

## 한계
- 열 때 항목 목록 전체를 메모리에 올린다. 암호화/zip64는 다루지 않는다. macOS의 Info-ZIP·bsdtar만 교차 검증했다.
