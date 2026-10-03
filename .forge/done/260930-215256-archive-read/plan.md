<!-- forge-slug: archive-read -->
<!-- task: 34 -->
<!-- priority: high -->
<!-- tdd: off -->
# td-archive: 아카이브 경로 표기와 읽기 (ZIP, tar 계열, 중첩)

## Goal / Non-goals
- Goal: 새 crate `td-archive`. (1) 아카이브 안 경로 표기 `바깥.zip!/안/경로`(중첩은 `a.zip!/b.zip!/c.txt`)와 분해 함수 `split_archive_path`(실제로 존재하는 아카이브 파일 기준으로 판정 — 이름에 `!/`가 들어간 폴더와 구분) + ADR(`docs/adr/0012-archive-path-notation.md`), (2) ZIP 계열(zip, jar, war, aar, apk, nupkg, klib, sublime-package + 설정 `file_systems.zip.additional_extensions`) 읽기: 목록, stat, 파일 열기(Read), (3) tar 계열(tar, tar.gz, tgz, tar.bz2) 읽기 전용, (4) 중첩 아카이브 읽기, (5) 안전한 추출(zip-slip 방어).
- Non-goals: 쓰기(다음 태스크), UI, rar/xar/cab/iso 등, 암호화 zip.

## Source of truth
- Glossary terms: VFS, VfsPath
- Related ADRs: docs/adr/0005 (Vfs trait로 아카이브를 폴더처럼)
- Definition of Done: `cargo test -p td-archive` 이름 지정 테스트 통과: `archive_path_split`(정상/중첩/`!/`가 든 실제 폴더 이름/존재하지 않는 아카이브/경로 끝), `zip_read_list_and_extract`(테스트가 tempdir에 만든 zip을 목록·stat·읽기, 한글 이름 포함), `zip_read_external_zip_cli`(**시스템 `zip` 명령으로 만든 zip**을 읽어 내용이 일치 — 외부 도구가 만든 파일), `tar_gz_read`(**시스템 `tar` 명령으로 만든** tar.gz와 tgz, tar.bz2 읽기), `archive_nested_read`(zip 안의 zip 안의 파일), `zip_slip_rejected`(`../evil`, `/abs`, `a\..\b`, 심볼릭 링크 항목이 든 악성 zip 추출 거부, tempdir 밖에 sentinel 경로가 생기지 않음). `zip_slip_rejected`는 zip 파일을 손으로 바이트 조립하거나 `zip` crate로 악성 이름을 써서 만든다.

## Work slices
- [ ] S1. 경로 표기 ADR과 `split_archive_path`/조립 함수 — completion criterion: `archive_path_split` 통과
- [ ] S2. ZIP 읽기(목록/stat/read, 인코딩·한글) — completion criterion: `zip_read_list_and_extract`, `zip_read_external_zip_cli` 통과 (depends: S1)
- [ ] S3. tar/tgz/tar.bz2 읽기 — completion criterion: `tar_gz_read` 통과 (depends: S1)
- [ ] S4. 중첩 읽기 — completion criterion: `archive_nested_read` 통과 (depends: S2)
- [ ] S5. 안전 추출과 `zip_slip_rejected` — completion criterion: 통과, THIRD_PARTY_NOTICES.md에 새 crate 라이선스 추가 (depends: S2, S3)
