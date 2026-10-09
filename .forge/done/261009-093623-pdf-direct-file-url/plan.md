<!-- forge-slug: pdf-direct-file-url -->
<!-- task: 124 -->
<!-- tdd: off -->
# 디스크 PDF를 파일 주소로 열어 큰 파일도 빠르게 보는 시험 (설정 스위치)

## 목표 / 하지 않을 것
- 목표: 큰 PDF 미리보기가 오래 걸리는 원인은 Rust가 파일을 읽어 base64로 싣고 프런트가 Blob으로 다시 만드는 과정이라고 본다. 스위치 `preview.pdf_direct`(기본 **false**, 설정 > 미리보기 탭)가 켜지면 **디스크의 PDF만** 이렇게 한다.
  - Rust: 서비스가 스위치를 들고(`apply_config`로 갱신, 용량 한도 설정과 같은 경로) 켜져 있으면 디스크 PDF에서 **파일을 읽지 않고** `kind: pdf`, `data_url: None`, `truncated: false`를 돌려준다(용량 한도 `pdf_max_mb` 무시). 꺼져 있거나 압축 안 PDF면 지금 방식 그대로다.
  - 프런트: `Preview`가 `kind === "pdf"`에서 `dataUrl`이 없고 `truncated`가 아니면 `PdfView`에 파일 주소(`api.fileUrl(path)`)를 준다. 이 경로에서는 Blob 만들기와 쪽 수 어림(`readText`)을 하지 않는다(쪽 수를 모르면 PageDown의 위쪽 제한이 없는 기존 동작).
  - 설정 항목은 ko·en 사전, ⓘ 설명(실험 기능이고 안 열리면 끄라는 안내), docs/06.
- 하지 않을 것: 압축 안 PDF, 자동 폴백(iframe은 뷰어 실패를 감지할 수 없다), 기본값을 켜는 일(실제 앱 확인 뒤 별도 결정), 쪽 수 세기를 Rust로 옮기는 일, Windows WebView2 확인(별도 기기).

## 기준 문서
- 관련 ADR: 없음. 용어: 없음. 선행: `preview-size-limits`(#123, 용량 한도), 미리보기 PDF `#page=N` 이동(`ui/previewScroll.ts`).
- 완료 정의(DoD). 작성 시 기준선: `pdf_direct` 키·테스트 없음(grep 0), vitest 실패 파일 기준선 2개(`model-formats`, `pdf-preview`).
  1. `cargo test -p td-config preview_pdf_direct`: 기본 false, true 허용, 문자열은 경고+기본값. 사전 상태: 없음(앞으로 가는 확인).
  2. `cargo test -p twin-deck-desktop pdf_direct`: 스위치 켜짐+디스크 PDF → `data_url` 없음·`truncated` false이고 **한도 초과 크기(희소 파일 11MB)도 같다**, 압축 안 PDF는 켜져도 지금 방식(데이터 또는 한도), 꺼짐이면 지금 방식(11MB는 `truncated`). 사전 상태: 없음.
  3. `bunx vitest run src/__tests__/pdf-direct.test.tsx`: 스위치 켜짐일 때 `iframe`의 `src`가 파일 주소이고 Blob URL이 아니며 `fetch`가 불리지 않는다. 꺼짐이면 지금 방식(Blob). 설정 화면에 항목이 있고 영어에서 영어다. 사전 상태: 파일 없음.
  4. 회귀: `tsc`, vitest 실패 파일 기준선 2개, `cargo test`·clippy·fmt 통과, `pdf-preview`·`preview-scroll`의 PDF 기대가 꺼짐 기본에서 그대로.
  5. 실제 앱 확인(사람, jsdom은 WKWebView 뷰어를 대신할 수 없다): 스위치를 켜고 큰(예: 100MB) PDF를 Space로 연다 → 열기 전 대기가 짧다, 쪽이 보인다, PageDown/PageUp으로 쪽이 넘어간다, 닫을 때 문제 없다. 안 열리거나 쪽 이동이 안 되면 결과를 알려 주고 스위치는 끈 채로 둔다. Windows는 별도 기기.

## 작업 조각
- [ ] S1. td-config `preview.pdf_direct` + 테스트 — 완료 기준: DoD 1
- [ ] S2. Service 스위치 보관·`apply_config`, 디스크 PDF 분기 + 테스트 — 완료 기준: DoD 2 (depends: S1)
- [ ] S3. gen-types, `PdfView`·`Preview` 분기, 설정 항목·사전·docs, `pdf-direct` 테스트 — 완료 기준: DoD 3 (depends: S2)
- [ ] S4. 전체 회귀와 실제 앱 확인 안내 — 완료 기준: DoD 4, DoD 5의 확인 방법이 run.md에 있다 (depends: S3)
