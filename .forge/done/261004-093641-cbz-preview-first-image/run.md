# RUN — cbz 미리보기: 압축 안의 첫 번째 이미지 보여 주기 (cbz-preview-first-image)

워크플로 없이 직접 실행했다(작은 작업).

- S1 `td-vfs`가 `image_mime`과 `image_data_url`을 공개, `td-archive`에 `Archive::first_image`(자연 정렬, 폴더·`__MACOSX/`·점 파일 제외)와 테스트 3개 — ✅ 계획대로
- S2 `service.rs`의 `preview`가 `.cbz`(대소문자 무시)면 첫 이미지를 data URL로 돌려준다. 이미지 없음·ZIP 아님은 `Other`, 10MiB 초과는 `truncated`+데이터 없음. 테스트 3개 — ✅ 계획대로
- S3 실제 `.cbz` 확인과 전체 회귀 검사 — ✅ 계획대로

## DoD baseline → after
- `first_image` 테스트: 0개 → 3개 통과
- `cargo test -p twin-deck-desktop cbz`: 0개 → 3개 통과
- 실제 파일(`남의 남자 [19세 완전판]-059.cbz`): 미확인 → 120개 항목, 첫 이미지 `001.jpg`(30816 B), `data:image/jpeg;base64,…`
- `cargo test --workspace`, fmt, clippy, `up_to_date`: 통과 → 통과
- `tsc` 오류 없음, vitest 504 통과·실패 1(기존 `pdf-preview`) → 동일

## 어긋난 점
- 서비스 테스트에서 `base64` 의존성을 늘리지 않으려고, 기대값을 `td_vfs::image_data_url`로 만들어 비교했다(첫 쪽 바이트로 만든 URL과 같아야 통과).
- 프런트엔드는 이미 이미지 종류를 그려서 바꾸지 않았다. 앱 화면에서 직접 열어 보지는 않았다.
