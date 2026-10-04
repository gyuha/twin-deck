<!-- forge-slug: cbz-preview-first-image -->
<!-- task: 45 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# cbz 미리보기: 압축 안의 첫 번째 이미지 보여 주기

## Goal / Non-goals
- Goal: `.cbz`(이미지를 ZIP으로 묶은 만화 파일)에서 미리보기(Space/→)를 열면 안의 첫 번째 이미지를 보여 준다. 첫 이미지는 이미지 확장자 파일 중 이름이 자연 정렬로 가장 앞선 것이다. 이미지가 없거나 ZIP이 아니면 오류 없이 "기타" 미리보기(종류와 크기)가 나온다. 이미지는 기존 한도 10MiB를 따른다.
- Non-goals: 여러 쪽 넘기기, cbr/rar/7z, `.cbz`를 폴더처럼 열기, 프런트엔드·DTO 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `cargo test -p td-archive`(`first_image` 테스트)와 `cargo test -p twin-deck-desktop cbz`가 통과하고, 실제 `.cbz` 한 개에서 `Image`와 `data:image/` 접두사가 나온다. `cargo test --workspace`, fmt, clippy, `tsc`, 전체 vitest(기존 `pdf-preview` 1건 제외)가 통과한다.

## Work slices
- [ ] S1. `td-vfs`가 이미지 MIME 판별(`image_mime`)을 공개하고, `td-archive`에 ZIP 안의 첫 이미지를 고르는 함수(자연 정렬, 폴더·`__MACOSX/`·숨김 파일 제외)와 테스트를 추가한다 — completion criterion: `cargo test -p td-archive`의 `first_image` 테스트들이 통과한다
- [ ] S2. `service.rs`의 `preview`가 `.cbz`(대소문자 무시)면 `td-archive`로 첫 이미지를 읽어 이미지 미리보기로 돌려주고(한도 초과면 `truncated`, 이미지 없음·손상 파일은 `Other`) `cbz` 테스트를 추가한다 — completion criterion: `cargo test -p twin-deck-desktop cbz`가 통과한다 (depends: S1)
- [ ] S3. 실제 `.cbz`로 확인하고 전체 회귀 검사를 돌린다 — completion criterion: 실제 파일에서 `Image`·`data:image/` 확인, `cargo test --workspace`·fmt·clippy·tsc·vitest 통과 (depends: S2)
