# ADR-0020. Office 문서 미리보기는 office_oxide로 글자·표를 뽑아 Markdown으로 보여 준다

- 상태: Accepted
- 날짜: 2026-10-15
- 대체: [ADR-0014](0014-macos-office-quicklook-preview.md), [ADR-0015](0015-windows-office-preview-handler.md)

## 맥락

이슈 #78이 [office_oxide](https://github.com/yfedoseev/office_oxide)로 Office 미리보기를 구현해 보라고 했다. 그때까지 미리보기는 세 갈래였다. macOS는 `qlmanage`(Quick Look)가 만든 HTML, Windows의 docx는 설치된 Office의 미리보기 처리기를 앱 창 위에 겹친 네이티브 창, 그 밖(Linux, Windows의 xlsx·pptx, 처리기가 없을 때)은 mammoth·SheetJS·JSZip으로 읽는 데이터 미리보기(`preview.office`, 기본 꺼짐)였다.

조사에서 확인한 것(2026-10-15): office_oxide 0.1.15는 **렌더러가 아니라 텍스트·Markdown·IR 추출 라이브러리**다. docx·xlsx·pptx와 구형 doc·xls·ppt를 읽고, 순수 Rust(MIT OR Apache-2.0)라 이 저장소의 rustc 1.93에서 C 도구체인 없이 빌드된다. 실제 문서의 서식·페이지·도형은 다루지 않는다. 그래서 교체하면 문서 모습의 충실도가 내려간다는 점을 사용자에게 알렸고, 사용자는 옛 구현을 모두 지우고 교체하기로 했다.

## 결정

- Rust가 `office_oxide::Document`로 파일을 열어 `to_markdown()`을 돌려준다(`office.rs`, 명령 `office_preview`). 화면은 기존 `MarkdownView`로 그린다. 3개 OS에서 같고 설정 스위치 없이 늘 켠다.
- 확장자는 docx·xlsx·pptx·doc·xls·ppt·docm·xlsm·pptm이다. 디스크 위 파일만 읽고 압축 안 파일은 "미리 볼 수 없는 형식"이다. 20MB를 넘는 파일은 읽지 않고, 결과 Markdown이 512KB를 넘으면 글자 경계에서 잘라 `truncated`로 알린다.
- 문서 모습이 아니라 데이터 미리보기라는 안내를 맨 위에 늘 붙인다(`office.note`).
- 지운 것: `quicklook.rs`·`preview_handler.rs`·`preview_host.rs`(`windows` 크레이트 의존 포함), 관련 Tauri 명령과 `ts-client` 항목, `QuickLookView`·`PreviewHandlerView`·`OfficeView`와 `lib/office/`, npm 패키지 mammoth·xlsx·jszip·dompurify, 설정 `preview.office`.
- 옛 사용자 `config.toml`에 `[preview] office = …`가 남아 있어도 설정은 그대로 읽힌다(`td-config` 테스트가 증명한다).

## 결과

- 장점: 3개 OS 동작이 같다(ADR-0013의 원칙 회복). 구형 doc·xls·ppt를 Windows·Linux에서도 읽는다. `qlmanage`처럼 보장되지 않은 디버그 도구나 Office 설치, 네이티브 창 겹치기, "차단 해제" 흐름이 필요 없다. 문서 안 코드는 아무것도 실행되지 않는다(Markdown만 그린다, 원시 HTML 비허용). 번들에서 JS 라이브러리 4개가 빠진다.
- 단점: 문서 모습(서식·페이지·도형·그림)이 사라진다. 지난 버전(0.6.x)에서 macOS·Windows 사용자가 보던 실제 문서 화면이 없어지므로 사용자에게 보이는 변경이다. 라이브러리가 0.x(2026-03 시작, 별 153)라 성숙도가 낮다. 구형 doc·xls·ppt의 동작은 이 저장소 테스트로 검증하지 못했다(이진 형식 픽스처를 만들지 못함).
- 후속 작업: 실제 앱(WKWebView·Windows)에서 큰 xlsx의 읽는 시간과 표 렌더링을 눈으로 확인한다. 구형 형식 픽스처를 확보하면 테스트에 더한다.

## 검토한 대안

- 옛 세 갈래 유지, 데이터 미리보기 경로만 office_oxide로 교체: 충실도 후퇴는 없지만 세 갈래가 남아 3개 OS 일관성과 유지 비용이 그대로다. 사용자가 전부 교체를 택했다.
- 이슈 #78에 검토 결과만 정리하고 구현하지 않기: 사용자가 구현을 택했다.
- docx-preview 같은 웹뷰 렌더러·LibreOffice 변환: ADR-0014에서 이미 검토했고 충실도와 설치 부담 때문에 택하지 않았다.
