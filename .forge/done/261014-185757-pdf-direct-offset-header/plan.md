<!-- forge-slug: pdf-direct-offset-header -->
<!-- task: 160 -->
<!-- tdd: on -->
# PDF 직접 열기: 맨 앞이 %PDF가 아닌 파일은 기존 데이터 경로로 보낸다

## 목표 / 비목표
- 목표: 설정 `preview.pdf_direct`(시험, 기본 꺼짐)를 켠 상태에서 맨 앞에 다른 바이트(예: `multipart/form-data` 업로드 머리 207바이트)가 붙은 `.pdf`가 텍스트로 깨져 보이는 문제를 고친다.
- 원인(확인함): 직접 열기는 파일을 Tauri 자산 프로토콜(`asset://`)로 웹뷰에 주는데, 이 프로토콜은 파일 앞 8192바이트의 매직 바이트로 `Content-Type`을 정한다(`tauri-2.12.0/src/protocol/asset.rs:85-96`). PDF 판정은 `%PDF`가 0번째 바이트에 있어야 해서 판정에 실패하고, 확장자 규칙의 기본값 `text/html`로 응답한다. 웹뷰가 PDF 바이트를 HTML로 그려 이어 붙은 글로 보인다. 같은 파일을 `application/pdf`를 명시한 데이터 URL로 주면 WKWebView가 정상 PDF로 그린다(재현으로 확인).
- 구현: `apps/desktop/src-tauri/src/service.rs`의 `Service::preview`가 직접 열기 모드에서 PDF를 읽지 않고 "PDF임"만 알리는 분기에서, 파일 앞 4바이트가 `%PDF`인지 확인한다. 맞으면 지금처럼 직접 열기, 아니면(또는 파일을 열지 못하면) 이 분기를 건너뛰어 기존 경로(`td_vfs::read_preview`, 데이터 URL, `pdf_max_mb` 한도 적용)로 보낸다. 1024바이트 허용 규칙은 두지 않는다.
- 결과로 받아들인 대가: 맨 앞이 `%PDF`가 아닌 PDF가 `pdf_max_mb`(기본 10MB)를 넘으면 직접 열기를 못 쓰고 "너무 큼" 안내가 뜬다.
- 비목표: 프런트엔드(`PdfView`) 변경, `Content-Type` 사후 보정(선택지 A), 파일 자체를 고치는 기능, `pdf_direct` 기본값 변경, 진짜 PDF가 아닌 `.pdf`(예: HTML 오류 페이지)를 따로 알아보는 일.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음.
- 정의 완료(DoD):
  1. `cargo test -p twin-deck-desktop pdf_direct_falls_back`이 1건 이상 통과한다(작성 시점 0건 → 앞으로 향하는 확인). **red→green**: S1에서 수정 전 코드에 대해 실패(직접 열기로만 응답해 `data_url`이 없음)하는 것을 확인해 run 기록에 남기고, 수정 후 통과한다.
  2. `cargo test -p twin-deck-desktop pdf_direct` 전체 통과(작성 시점 2건 통과 → 새 테스트를 더한 건수). 기존 `pdf_direct_on_skips_reading_and_ignores_the_size_limit_for_disk_pdfs`는 0으로 채운 희소 파일을 쓰는데, 그 파일은 맨 앞이 `%PDF`가 아니라 새 규칙에서는 직접 열기 대상이 아니다. 그래서 이 테스트의 파일 맨 앞에 `%PDF-`를 써 두도록 고친다(계획된 조정). 고친 뒤에도 같은 단언(직접 열기는 읽지 않고 한도를 무시)이 통과해야 한다.
  3. `cargo test -p twin-deck-desktop up_to_date` 통과(타입·설정 변경 없음, 작성 시점에 통과 중인 회귀 방어).
  4. `cargo clippy -p twin-deck-desktop -- -D warnings`와 `cargo fmt --check` 통과(작성 시점에 통과 중인 회귀 방어; AGENTS.md: `--all-targets`가 아니라 이 명령이 실제 관문).
  5. `grep -c '%PDF' docs/06-config-plugins.md` ≥ 1(작성 시점 0 → 앞으로 향하는 확인).
  - 이 DoD는 실제 앱(WKWebView)에서 이 PDF가 보이는지는 증명하지 못한다. 사용자 확인이 필요하다: `pdf_direct = true`인 상태에서 `/Users/gyuha/Downloads/윤성현 님 이력서/윤성현 님 포트폴리오.pdf`를 미리보기해 PDF로 보이는지 본다.

## 작업 조각
- [ ] S1. 먼저 실패하는 테스트를 쓴다(`service.rs` 테스트 모듈, `direct_cfg` 사용): (a) 맨 앞에 `--boundary\r\n…\r\n\r\n`이 붙은 `%PDF-1.7…` 작은 파일 + 직접 열기 켬 → `data_url`이 있고 `kind`는 Pdf, `truncated`는 거짓. (b) 같은 모양이 `pdf_max_mb`를 넘으면(희소 파일 앞에 비PDF 바이트) 직접 열기 켠 채 `truncated`이고 `data_url`은 없음(한도 적용을 못 박음). (c) 정상 `%PDF-` 파일은 여전히 직접 열기(`data_url` 없음). 이름은 `pdf_direct_falls_back_*`. — 완료 기준: (a)(b)가 현재 코드에서 실패하고 실패 출력을 run 기록에 남긴다.
- [ ] S2. `Service::preview`의 직접 열기 분기에 "맨 앞 4바이트가 `%PDF`" 조건을 더한다(파일을 못 열면 건너뜀). 기존 희소 파일 테스트에 `%PDF-` 머리를 써 넣는다. — 완료 기준: DoD 1·2·3. (depends: S1)
- [ ] S3. `docs/06-config-plugins.md`의 `pdf_direct` 설명에 "맨 앞이 `%PDF`가 아닌 파일은 이 경로를 쓰지 않고 기존 방식(`pdf_max_mb` 한도)으로 연다. 자산 프로토콜이 맨 앞 바이트로 형식을 판정하기 때문이다"를 더하고 코드 주석에 이유를 남긴다. 전체 검증을 돌린다. — 완료 기준: DoD 4·5. (depends: S2)
