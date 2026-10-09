<!-- forge-slug: epub-preview-1of2 -->
<!-- task: 128 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# epub 미리보기 (1/2): Rust가 epub을 읽는다 (메타·표지·목차·챕터 HTML)

## 목표 / 하지 않을 것
- 목표: 디스크의 `.epub`(ZIP 안에 XHTML 챕터·이미지·`content.opf`가 든 전자책)을 Rust가 읽어 UI가 쓸 수 있게 한다. 이 조각은 화면을 만들지 않는다(2of2). 명령 2개:
  - `epub_open(path)` → `EpubInfoDto { title, author, cover(데이터 주소, 한도 안일 때만), chapters: [{ title }] }`. 챕터 순서는 OPF `spine`, 제목은 EPUB3 `nav`·EPUB2 `toc.ncx`에서 구하고 없으면 `챕터 N`(번역 대상 문구). 표지는 manifest의 `properties="cover-image"` 또는 `<meta name="cover">`.
  - `epub_chapter(path, index)` → 그 챕터의 HTML 문자열. `<img src>`·SVG `<image href>`의 상대 경로는 안의 이미지를 데이터 주소로 바꿔 넣고(이미지 한도 `preview.image_max_mb` 안일 때만, 넘으면 그대로 두어 깨진 그림이 됨), `<link rel=stylesheet>`는 `<style>`로 인라인(파일당 512KB 이하), `<script>`는 지운다.
  - `Backend` 인터페이스(`backend.ts`·`tauri.ts`)와 `FakeBackend`(`fake.ts`)에 같은 메서드. XML은 새 크레이트 `roxmltree`로 읽는다(HTML은 정규식으로 다룬다, 파서 의존성 없음).
- 오류(모두 `Err`, 문구는 Rust 문구 대응표에 등록): ZIP이 아님·`META-INF/container.xml`/OPF 없음·DRM(`META-INF/encryption.xml`이 있고 글꼴 난독화 외의 암호화가 있음)·파일 100MB 초과·챕터 HTML 2MB 초과·인덱스 범위 밖. 경로는 OPF 폴더 기준으로 정규화하고 `..`로 안을 벗어나면 거부한다.
- 하지 않을 것: 화면(2of2), 압축 파일 안 epub(디스크 파일만), 새 설정(이미지는 기존 한도), JS가 도는 epub(스크립트는 지운다), 글꼴·`url()` 안 리소스 인라인, 고정 레이아웃 epub의 정확한 재현, 내부 링크 이동.

## 기준 문서
- 관련 ADR: [ADR-0014](../../docs/adr/0014-macos-office-quicklook-preview.md)(스크립트 없는 격리 iframe 방식은 2of2가 따른다). 용어: 없음. 선행: `preview-size-limits`(#123, `image_max_mb`), cbz 미리보기(`service.rs`의 `cbz_preview`, `td_archive::Archive::open_as(…, Kind::Zip)`).
- 완료 정의(DoD). 작성 시 기준선: `epub` 코드·테스트 없음(`grep -ri epub crates apps packages` 0건), vitest 실패 파일 기준선 2개(`model-formats`, `pdf-preview`).
  1. `cargo test -p twin-deck-desktop epub`: 테스트가 만든 샘플 epub(EPUB3: `nav`+`cover-image`, EPUB2: `toc.ncx`+`<meta name="cover">`)에서 값으로 단언한다 — 제목·저자, 표지가 `data:image/png;base64,`로 시작, 챕터 제목이 spine 순서대로(nav/ncx 제목, 없으면 `챕터 N`), 챕터 HTML의 `<img>`가 `data:`로 바뀌고 `<script>`가 없으며 CSS가 `<style>`로 들어옴, 한도를 넘는 이미지는 그대로 둠. 오류: ZIP 아님·container 없음·DRM·챕터 2MB 초과(희소 파일)·범위 밖 인덱스·`../../x` 경로. 사전 상태: 없음(앞으로 가는 확인).
  2. `cargo test -p twin-deck-desktop up_to_date`: `task gen-types` 뒤 바인딩이 최신이다. 사전 상태: 통과(새 명령 추가 뒤엔 `gen-types` 전까지 실패하므로 앞으로 가는 확인).
  3. `cd apps/desktop && bunx vitest run src/__tests__/epub-backend.test.ts`: `FakeBackend`의 `epubOpen`/`epubChapter`가 시드한 epub 데이터를 돌려주고, 없는 경로·범위 밖 인덱스는 거부한다. 사전 상태: 파일 없음.
  4. 회귀: `bunx tsc --noEmit`, vitest 실패 파일 기준선 2개, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`, `cargo test -p twin-deck-desktop`(`coalesce_*` 타이밍 불안정은 기준선).

## 작업 조각
- [ ] S1. `roxmltree` 추가, `src-tauri/src/epub.rs`: container→OPF 파싱(메타·manifest·spine·표지·목차 제목)과 경로 정규화·오류, 테스트 먼저 — 완료 기준: DoD 1의 메타·표지·목차·오류 부분
- [ ] S2. 챕터 HTML 가공(이미지·CSS 인라인, `<script>` 제거, 크기 상한)과 `Service`·`commands.rs`의 `epub_open`/`epub_chapter`, Rust 문구 대응표 — 완료 기준: DoD 1 전체 (depends: S1)
- [ ] S3. `task gen-types`, `backend.ts`·`tauri.ts`·`fake.ts`, `epub-backend` 테스트, 회귀 — 완료 기준: DoD 2·3·4 (depends: S2)
