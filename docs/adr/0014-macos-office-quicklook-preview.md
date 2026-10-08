# ADR-0014. macOS의 Office 미리보기는 Quick Look HTML을 스크립트 없는 iframe으로 보여 준다

- 상태: Accepted
- 날짜: 2026-10-08

## 맥락

Office 문서 미리보기(VIEW-01)는 mammoth·SheetJS·JSZip으로 내용을 뽑아 보여 주는 데이터 미리보기라, 페이지·글꼴·셀 서식·도형 위치가 모두 사라진다. 사용자는 실제 문서 모습을 원했다. 배치까지 계산하는 렌더러가 필요하고, 웹 라이브러리로는 docx는 가깝지만 pptx·xlsx는 실제와 거리가 있다.

macOS에는 Finder의 Quick Look이 쓰는 생성기(`/System/Library/QuickLook/Office.qlgenerator`)가 있다. `qlmanage -p -o <폴더> <파일>`이 docx·xlsx·pptx와 구형(doc·xls·ppt)·매크로 형식을 HTML로 만들어 준다(2026-10-08 측정: 작은 문서 0.1~0.3초, 43MB xlsx 1.1초, xlsx는 시트마다 앞 4096행에서 자른다, 망가진 pptx에서는 끝나지 않고 멈춘다). 공개 API인 `QLThumbnailGenerator`는 첫 페이지 그림만 주고 xlsx 그림은 쓸모가 없다.

이 HTML은 doctype이 없고 단위 없는 길이(`width: 432`)를 써서 quirks 모드에서만 제 모습이 나온다. xlsx는 시트 탭을 JS로 바꾼다. 앱 웹뷰는 CSP가 없고 Tauri 명령을 부를 수 있다.

[ADR-0013](0013-lookup-query-syntax.md)은 "3개 OS에서 같게 동작"을 원칙으로 삼았다. 이 결정은 그 원칙의 의식적인 예외다.

## 결정

- macOS에서는 Office 문서(docx·xlsx·pptx, doc·xls·ppt, docm·xlsm·pptm)를 `preview.office` 설정과 관계없이 Quick Look HTML로 보여 준다. Windows는 기존 데이터 미리보기(`preview.office`, 기본 꺼짐)를 그대로 썼으나, 이후 [ADR-0015](0015-windows-office-preview-handler.md)로 Windows 미리보기 처리기로 바뀌었다(처리기가 없을 때만 이 데이터 미리보기로 돌아간다).
- Rust가 `qlmanage -p -o`를 10초 시간 제한으로 실행하고, 다른 항목으로 넘어가면 돌던 프로세스를 종료한다. 파일 크기 상한은 두지 않는다.
- 프런트엔드는 결과를 **Blob URL** + `sandbox="allow-same-origin"`(`allow-scripts` 없음) iframe에 띄운다. 문서 쪽 스크립트는 하나도 실행되지 않는다.
  - `srcdoc`은 쓰지 않는다. srcdoc 문서는 doctype이 없어도 늘 표준 모드라 단위 없는 길이가 무시되고, pptx가 회색 바탕만 남는다(2026-10-08 WKWebView 실측: srcdoc은 `CSS1Compat`·`width: 720` 무시, Blob URL은 `BackCompat`·적용).
  - 스크립트를 끈 문서에서는 앱(부모)이 붙인 이벤트 리스너도 WebKit이 실행하지 않는다(같은 실측). 그래서 iframe은 마우스·포커스를 받지 않게 하고(`pointer-events: none`, `tabIndex=-1`), 문서 크기만큼 늘려(넓으면 축소) 미리보기 본문이 스크롤한다. 키는 늘 앱에 남고 링크는 눌리지 않는다. 대신 문서 안 글자는 선택할 수 없다.
- 요청마다 프런트가 늘어나는 순번을 붙이고, Rust는 들어온 순서가 아니라 이 순번으로 최근 요청을 가린다. Tauri가 명령을 스레드 풀에서 돌려 보낸 순서와 다르게 들어오면, 늦게 들어온 이전 요청이 지금 요청을 끊어 "취소되었습니다"가 보였다(개발 모드의 StrictMode는 같은 파일을 두 번 요청한다).
- xlsx의 시트 탭은 QL의 JS 대신 앱이 그린다(Rust가 시트 이름과 HTML 목록을 넘긴다).

## 결과

- 장점: Finder와 같은 모습을 번들 증가 없이 보여 준다. 구형·매크로 형식도 같은 생성기로 처리된다. 문서 쪽 JS가 돌지 않고 iframe이 입력을 받지 않아 악성 문서가 앱 명령에 닿을 길이 좁다.
- 단점: `qlmanage`는 Apple의 디버그 도구라 출력 형식(`Preview.html`, `AttachmentN.*`, 탭 구조)이 보장된 규약이 아니다. macOS가 바뀌면 깨질 수 있다. 두 OS의 미리보기 모습이 다르다. QL은 xlsx를 4096행에서 안내 없이 자른다. 압축 파일 안의 문서는 실제 파일이 아니라 다루지 않는다. 문서 안 글자를 선택·복사할 수 없다. jsdom은 srcdoc 모드와 sandbox 리스너 제약을 흉내 내지 않아, 이 두 가지는 단위 테스트로 잡히지 않는다.
- 후속 작업: macOS 업데이트 뒤 QL 출력 구조가 바뀌면 Rust 조립 테스트(저장해 둔 QL 출력 fixture)와 실제 앱 확인으로 잡는다.

## 검토한 대안

- 웹뷰용 JS 렌더러(docx-preview, pptx 렌더러, ExcelJS 서식 표): 두 OS가 같지만 pptx·xlsx 충실도가 떨어지고 번들이 커진다.
- LibreOffice로 PDF 변환 후 PdfView: 충실도는 높지만 사용자가 LibreOffice를 설치해야 하고 첫 변환에 수 초가 걸린다.
- 첫 페이지 그림(`QLThumbnailGenerator`): 공개 API라 안정적이지만 첫 페이지뿐이고 xlsx에는 쓸 수 없다.
- 시스템 Quick Look 창(`QLPreviewPanel`): 충실도는 완벽하지만 앱 밖 창이라 방향키로 항목을 넘기는 미리보기 흐름과 따로 논다.
- 다른 출처 iframe에서 QL의 JS를 허용하고 postMessage로 스크롤·키를 넘기는 방식: 문서 쪽 JS가 도는 만큼 공격면이 남는다.
- Shadow DOM에 직접 넣기: 앱 문서가 표준 모드라 단위 없는 길이가 무시되어 배치가 깨진다.
- `srcdoc` iframe: 위와 같은 이유(srcdoc은 늘 표준 모드)로 처음 구현했다가 실제 앱 확인에서 pptx가 회색으로만 보여 버렸다.
- iframe을 입력 가능하게 두기: 글자 선택은 되지만, 문서를 한 번 누르면 Esc·↑↓가 앱으로 오지 않고 링크가 iframe 안에서 이동한다(앱이 붙인 리스너가 돌지 않아 막을 수 없다).
