<!-- forge-slug: office-quicklook-preview-1of2 -->
<!-- task: 115 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# macOS에서 docx·pptx 계열 문서를 Quick Look 미리보기로 실제 모습 그대로 보여 준다 (1/2)

## 목표 / 하지 않을 것
- 목표: macOS(`platform === "mac"`)에서 디스크 위의 docx·pptx·doc·ppt·docm·pptm을 미리보기(Space)로 열면, `preview.office` 설정과 관계없이 Quick Look이 만든 HTML을 iframe에 Finder와 같은 모습으로 보여 준다. 그 밖의 OS와 형식은 지금 동작 그대로다.
  - **Rust** `Service::quicklook_preview(path)` + 명령 `quicklook_preview`
    - 먼저 파일이 실제로 있는지 확인한다. NFC로 없으면 NFD로 다시 찾는다(AGENTS.md "Platform gotchas"). `qlmanage`는 **없는 경로를 받으면 끝나지 않고 멈춘다**(작성 시 재현). 폴더와 압축 안 경로(`x.zip!/…`)는 거부한다.
    - `tempfile::tempdir()`에 `qlmanage -p -o <dir> <path>`를 실행한다. **10초**가 지나면 자식 프로세스를 kill하고 `Quick Look으로 미리 볼 수 없습니다 (시간 초과)`를 돌려준다. 파일 크기 상한은 없다.
    - 성공 여부는 **종료 코드가 아니라** `<dir>/*.qlpreview/Preview.html`이 있는지로 판단한다. 망가진 docx도 종료 코드는 0이고 "did not produce any preview"만 출력한다(작성 시 재현). 없으면 `Quick Look으로 미리 볼 수 없습니다`를 돌려준다. `.qlpreview` 폴더 이름은 직접 만들지 말고 찾아서 쓴다(파일 이름의 유니코드 정규화가 다를 수 있다).
    - Service는 현재 작업 하나만 들고 있다. 새 요청이 오면 돌고 있던 qlmanage를 kill하고 이전 TempDir을 버린다. 이전 요청은 취소 오류로 끝나고, 프런트는 지난 요청의 응답을 무시한다. 현재 결과의 TempDir은 다음 요청이 올 때까지 남긴다(첨부 그림을 asset URL로 읽기 때문).
    - 반환값은 `{ html, dir }`이다. `html`은 Preview.html 원문이고, `dir`은 `AttachmentN.*` 첨부가 있는 폴더다. 테스트에서 가짜 실행 파일을 쓸 수 있도록 실행기는 프로그램 경로와 시간 제한을 인자로 받는다.
    - macOS가 아닌 OS에서는 `이 OS에서는 지원하지 않습니다`를 돌려준다(`cfg`).
  - **Backend** `quickLookPreview(path)`: `backend.ts` → `tauri.ts`(invoke) → `fake.ts`(응답·오류·지연을 설정할 수 있다). 명령을 추가한 뒤 `task gen-types`를 돌린다.
  - **UI** `ui/QuickLookView.tsx`
    - `<iframe srcDoc sandbox="allow-same-origin" data-quicklook>`로 띄운다. **`allow-scripts`는 넣지 않는다**(ADR-0014). 문서 쪽 스크립트는 하나도 돌지 않고, 앱은 같은 출처로 iframe 안을 다룬다.
    - html 안의 첨부 참조(`src="AttachmentN.png"`, `href="AttachmentN.css"` 등)를 `api.fileUrl(dir + "/" + 이름)`으로 하나씩 바꾼다. `<base href>`는 쓰지 않는다. `convertFileSrc`가 경로의 `/`를 `%2F`로 인코딩해서 상대 경로가 잘못 해석될 것으로 본다(추정). 실제 앱에서 그림이 보이지 않으면 Rust가 첨부를 data URL로 넣는 방식으로 바꾸고 run.md에 적는다.
    - 너비 맞춤: 문서가 패널보다 넓으면 패널 폭에 맞게 줄인다(100%보다 크게 키우지 않는다). 패널 크기가 바뀌면 다시 맞춘다.
    - 문서 안 링크를 눌러도 이동하지 않게 막는다.
    - 문서 안을 클릭해 iframe에 포커스가 가도, 키(Esc·↑↓·←→·PageUp/PageDown·Delete·Mod+S 등)는 앱의 키 처리로 넘긴다.
    - "데이터 미리보기이며 실제 문서 화면과 다릅니다" 안내는 붙이지 않는다. 불러오는 중·오류 문구는 기존 스타일을 따른다.
  - `ui/previewScroll.ts`: `data-quicklook` iframe은 `#page=N`(PDF 방식) 대신 iframe 문서를 한 화면의 0.9씩 스크롤한다.
  - `ui/Preview.tsx`: `platform === "mac"`이고, 파일이고, 압축 안 경로가 아니고, 확장자가 문서 계열이면 `QuickLookView`를 쓴다. 나머지는 지금 그대로다(`renderApp` 기본 플랫폼이 `linux`라서 기존 Office 테스트는 그대로 데이터 미리보기를 탄다).
  - `lib/office/kinds.ts`: Quick Look 문서 계열(docx·pptx·doc·ppt·docm·pptm, 대소문자 무시)을 판별하는 함수를 추가한다.
  - 설정 `preview.office`의 설명을 "Windows·Linux의 데이터 미리보기 스위치이며, macOS는 이 설정과 관계없이 Quick Look으로 실제 문서 모습을 보여 준다"는 뜻으로 고친다. 설정 구조와 기본값(꺼짐)은 그대로다.
- 하지 않을 것:
  - xlsx·xls·xlsm(2/2에서 한다. 이 단계에서는 macOS에서도 지금처럼 데이터 미리보기 또는 꺼짐 안내)
  - Windows·Linux 동작 변경
  - 압축 파일 안 문서(실제 파일이 아니라 QL에 넘길 수 없다)
  - 문서 쪽 스크립트 실행, QL 썸네일, 시스템 Quick Look 창(`QLPreviewPanel`)
  - 크기 상한, 시간 제한을 설정 키로 노출
  - 데이터 미리보기 코드(mammoth·SheetJS·JSZip) 삭제(Windows·Linux가 쓴다)
  - Pages·Numbers·Keynote, HWP 등 Office가 아닌 문서

## 기준 문서
- 용어: `.forge/CONTEXT.md`의 **데이터 미리보기**, **Quick Look 미리보기**(이번 grilling에서 추가)
- 관련 ADR: `docs/adr/0014-macos-office-quicklook-preview.md`(이번 grilling에서 추가). `docs/adr/0013`의 "3개 OS에서 같게"에 대한 의식적인 예외다.
- 작성 시 실측(2026-10-08, 이 맥)
  - `/System/Library/QuickLook/Office.qlgenerator`가 docx·pptx·xlsx를 HTML로 만든다. 작은 문서는 0.1~0.3초가 걸렸다.
  - docx 출력: 여백과 글꼴이 들어간 HTML, doctype 없음, 단위 없는 길이를 쓴다(quirks 모드 전제). 그래서 Shadow DOM에 넣을 수 없다.
  - pptx 출력: 모든 슬라이드를 원래 위치 그대로 절대 배치한 HTML.
  - 생성기 UTI에 doc·xls·ppt와 매크로 형식이 들어 있다. 구형 샘플은 `textutil -convert doc`로 만들 수 있다.
- 선행 작업: `office-preview`(#83), `docx-preview-sanitize`(#88), `office-stale-size`(#92). `preview.office` 기본 꺼짐은 커밋 `80d6947`.
- 완료 정의(DoD). 작성 시 기준선: `tsc` 통과, vitest 1009건 통과이고 실패 파일 2개(`model-formats.test.ts`는 jsdom에 canvas가 없어 로드 실패, `pdf-preview.test.tsx`는 jsdom Blob에 `.text()`가 없음)는 기준선 잡음, `cargo test -p twin-deck-desktop` 57건 통과, `cargo clippy -p twin-deck-desktop -- -D warnings` 통과.
  1. `cargo test -p twin-deck-desktop quicklook`이 통과하고, 이름에 `quicklook`이 들어간 테스트가 5건 이상이다. 테스트는 값으로 단언한다.
     - (a) 없는 경로는 qlmanage를 부르지 않고 오류가 난다.
     - (b) 가짜 실행 파일(`sleep`)이 시간 제한(테스트에서는 짧게)을 넘기면 `시간 초과` 오류가 나고, 끝난 뒤 그 자식 pid가 살아 있지 않다.
     - (c) 새 요청이 들어오면 이전 요청의 자식이 kill되고, 이전 요청은 취소 오류로 끝난다.
     - (d) 종료 코드가 0이어도 Preview.html이 없으면 `미리 볼 수 없습니다` 오류가 난다.
     - (e) `cfg(target_os = "macos")`에서 `textutil -convert docx`와 `-convert doc`로 만든 문서를 실제 qlmanage로 돌리면, html에 원문 문장이 들어 있다.
     - 사전 상태: `cargo test -p twin-deck-desktop quicklook -- --list | grep -c ': test'` → `0`. 앞으로 가는 확인이며, TDD로 (a)~(d)가 먼저 red여야 한다.
  2. 새 `apps/desktop/src/__tests__/quicklook-preview.test.tsx`(`renderApp(…, "mac")`)가 통과한다.
     - (a) docx·pptx·doc 미리보기에서 `iframe[data-quicklook]`의 `sandbox` 값이 정확히 `allow-same-origin`이고, srcdoc에 가짜 본문이 들어 있다.
     - (b) `preview.office`가 기본값(false)이어도 Quick Look으로 보이고, "실제 문서 화면과 다릅니다" 안내가 없다.
     - (c) `AttachmentN.png` 참조가 `fileUrl(dir/AttachmentN.png)`로 바뀐다.
     - (d) 백엔드가 오류를 내면 오류 문구가 보인다.
     - (e) 빠르게 다음 항목으로 넘기면 마지막 항목의 결과만 보인다(늦게 온 이전 응답을 무시한다).
     - (f) macOS의 xlsx와 linux의 docx는 지금 동작 그대로다.
     - (g) PageDown을 누르면 `data-quicklook` iframe의 `src`에 `#page`가 붙지 않고, iframe 문서가 스크롤된다.
     - (h) iframe 문서에서 일어난 `Escape` keydown이 미리보기를 닫는다.
     - jsdom이 srcdoc 문서를 불러오지 못해 (g)(h)를 앱 수준에서 볼 수 없으면, 해당 함수 단위 테스트로 바꾸고 run.md에 적는다.
     - 사전 상태: 파일이 없어 실패한다(앞으로 가는 확인).
  3. 회귀 방지(사전에 통과하는 것이 정상이다)
     - `cd apps/desktop && bunx tsc --noEmit` 통과
     - `bunx vitest run`에서 실패 파일이 기준선의 2개뿐이고 새 실패가 0건이다(기존 `office-preview`·`office-stale-size`·`settings` 테스트 포함)
     - `cargo test -p twin-deck-desktop` 전부 통과(`bindings_are_up_to_date`, `default_config_fixture_is_up_to_date` 포함)
     - `cargo clippy -p twin-deck-desktop -- -D warnings` 통과
  4. 문서와 설정 설명(사전 상태는 모두 0이며, 앞으로 가는 확인이다)
     - `grep -c 'ADR-0014\|0014-macos' docs/01-feature-spec.md`가 1 이상이다. VIEW-01 행에 macOS Quick Look 미리보기(문서 계열 확장자, 설정과 무관, 10초 제한, 압축 안 제외)를 적는다. 줄 앞쪽의 "Quick Look 사용 여부는 미확인"도 고친다.
     - `grep 'core.preview.page_up' docs/05-actions-keybindings.md | grep -c 'Quick Look'`이 1 이상이다.
     - 설정 화면 테스트에서 `preview.office` 설명에 "Quick Look"이 보인다(`settings.test.tsx`의 단언을 문자열 grep이 아니라 렌더링된 설명으로 한다).
  5. 실제 앱 확인(사람). WKWebView의 iframe 렌더링, asset URL 그림, 포커스와 스크롤은 jsdom이 대신할 수 없어 자동으로 확인할 수 없다. 격리 인스턴스(AGENTS.md "Verifying in the real app")에서 아래를 확인한다.
     - 그림이 든 docx, pptx, doc을 Space로 열면 Finder Quick Look과 같은 모습이고 그림도 보인다.
     - 패널을 좁히면 폭에 맞게 줄어든다.
     - PageUp/PageDown으로 스크롤된다.
     - 문서 안을 클릭한 뒤에도 Esc로 닫히고 ↓로 다음 항목으로 간다.
     - 링크를 눌러도 이동하지 않는다.
     - 망가진 docx에서는 "Quick Look으로 미리 볼 수 없습니다"가 나온다.

## 작업 조각
- [ ] S1. Rust QL 실행기, `Service::quicklook_preview`, 명령 등록, `task gen-types` — 완료 기준: DoD 1이 green이다. (a)~(d)가 먼저 red였던 기록이 run.md에 있다.
- [ ] S2. Backend `quickLookPreview`(`backend.ts`·`tauri.ts`·`fake.ts`) — 완료 기준: `tsc` 통과, FakeBackend로 응답·오류·지연을 설정할 수 있다 (depends: S1)
- [ ] S3. `QuickLookView`, `Preview.tsx` 연결, `kinds.ts` 판별 함수, `previewScroll.ts` 분기 — 완료 기준: DoD 2가 green이다(먼저 red) (depends: S2)
- [ ] S4. 설정 `preview.office` 설명, `docs/01` VIEW-01, `docs/05` page_up/page_down 행 — 완료 기준: DoD 4 (depends: S3)
- [ ] S5. 전체 회귀 확인과 실제 앱 확인 안내 — 완료 기준: DoD 3이 green이다. DoD 5의 확인 항목과 격리 인스턴스 실행 방법이 run.md에 적혀 있다 (depends: S4)
