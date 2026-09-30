<!-- forge-slug: archive-write -->
<!-- task: 21 -->
<!-- priority: high -->
<!-- tdd: off -->
# td-archive: ZIP 쓰기(추가/삭제/이름 변경/폴더)와 중첩 되쓰기

## Goal / Non-goals
- Goal: ZIP 계열 아카이브에 항목 추가(로컬 파일 → 아카이브), 삭제, 이름 변경, 폴더 만들기, 아카이브 안 파일 덮어쓰기를 구현한다. 모든 쓰기는 **새 임시 zip을 만들어 원자적으로 교체**하며 실패하면 원본이 온전하다. 중첩 아카이브 안을 수정하면 안쪽 아카이브를 다시 만들어 바깥 아카이브에 되쓴다(ARC-03). tar 계열은 읽기 전용이라 쓰기 시도는 명확한 오류.
- Non-goals: 압축 수준 옵션, 암호화, 스트리밍 대용량 최적화(전체 재작성 방식 허용), UI.

## Source of truth
- Glossary terms: VFS
- Related ADRs: docs/adr/0005, 0012
- Definition of Done: `cargo test -p td-archive` 통과: `zip_write_roundtrip_unzip_t`(우리 코드로 만든/수정한 zip을 **시스템 `unzip -t`가 오류 없이 통과**시키고 `unzip -p`로 뽑은 내용이 일치, 한글 이름·빈 폴더·여러 항목), `archive_nested_write_back`(바깥.zip!/안.zip!/x.txt 수정 후 바깥 zip을 `unzip`으로 열어 안.zip을 꺼내 다시 열면 수정이 반영), `archive_readonly_errors`(tar/tgz/bz2에 쓰기 시도 → "읽기 전용" 오류, 파일 불변), 그리고 원자성 테스트 `zip_write_failure_keeps_original`(쓰기 도중 실패를 주입해도 원본 zip의 바이트가 그대로 — 이 테스트 이름도 `cargo test`에서 존재·통과해야 함). 쓰기 후 mtime 등은 검증하지 않아도 되지만 내용은 반드시 검증.

## Work slices
- [ ] S1. 재작성 엔진(항목 목록 읽기 → 변경 적용 → 새 zip → 원자적 교체, 실패 주입 훅) — completion criterion: `zip_write_failure_keeps_original` 통과
- [ ] S2. 추가/삭제/이름 변경/mkdir/덮어쓰기 — completion criterion: `zip_write_roundtrip_unzip_t` 통과 (depends: S1)
- [ ] S3. 중첩 되쓰기 — completion criterion: `archive_nested_write_back` 통과 (depends: S2)
- [ ] S4. 읽기 전용 형식 오류 — completion criterion: `archive_readonly_errors` 통과
