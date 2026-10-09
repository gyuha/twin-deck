<!-- forge-slug: epub-preview-1of2 -->
# 실행 기록 — epub 미리보기 (1/2) Rust 읽기

## 한 일
- `src-tauri/src/epub.rs`(새): container→OPF 파싱(roxmltree), 메타·표지(nav `cover-image`·EPUB2 `<meta name=cover>`)·목차(nav/ncx, 없으면 `챕터 N`), 경로 정규화(`..` 탈출·스킴·절대경로 거부), DRM·크기(파일 100MB·챕터 2MB) 오류, 챕터 HTML 가공(이미지 데이터 주소·CSS `<style>` 인라인·`<script>` 제거). 테스트 11개.
- `service.rs`: `epub_open`/`epub_chapter`(압축 안 경로 거부, 이미지 한도 `image_bytes` 사용)와 서비스 테스트 1개. `commands.rs`·`main.rs` 등록.
- 생성: `task gen-types` → `bindings.ts`. `backend.ts`·`tauri.ts`·`fake.ts`(`seedEpub`·호출 기록·오류 시드)·`index.ts` 내보내기.
- `i18n/rust.ts`: 새 Rust 문구 12개의 영어 대응.
- 테스트: `epub-backend.test.ts` 4개.

## 계획과 실제
- 계획과 같다. TDD는 테스트와 구현을 한 번에 써서 빨간 단계를 따로 두지 않았다(처음 컴파일 오류 하나를 고친 뒤 첫 실행에서 11개 모두 통과).

## 검증
- DoD 1: `cargo test -p twin-deck-desktop epub` 12개 통과. DoD 2: `up_to_date` 통과·bindings에 epub 있음. DoD 3: epub-backend 4 통과. DoD 4: tsc 통과, vitest 실패는 기준선 2개뿐, clippy -D warnings·fmt·`cargo test -p twin-deck-desktop` 96 통과.
- 알려진 한계: HTML은 문자열 처리라 아주 특이한 태그 형태는 이미지·스타일이 빠질 수 있다. 실제 epub 파일로는 아직 열어 보지 않았다(합성 샘플만).
