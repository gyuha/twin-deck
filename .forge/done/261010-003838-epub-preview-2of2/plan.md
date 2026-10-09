<!-- forge-slug: epub-preview-2of2 -->
<!-- task: 129 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# epub 미리보기 (2/2): 표지·제목·저자 머리말, 목차 상자, 챕터 읽기 (이슈: epub 미리보기 요청)

## 목표 / 하지 않을 것
- 목표: 디스크의 `.epub`을 Space로 열면 미리보기에 머리말(표지 이미지·제목·저자)과 목차 선택 상자, 그 아래 현재 챕터 본문이 나온다. 선행: `epub-preview-1of2`(`epubOpen`/`epubChapter`).
  - 본문은 스크립트 없는 격리 iframe(`sandbox="allow-same-origin"`, Blob URL, 마우스·포커스를 받지 않음)으로 그리고 미리보기 본문이 스크롤한다(ADR-0014의 `QuickLookView`와 같은 방식, `layout` 재사용 검토).
  - 챕터 이동: 기존 액션 `core.preview.next_sheet`/`prev_sheet`(`Ctrl+Tab`/`Ctrl+Shift+Tab`)를 챕터에도 쓰고(`previewSheet` 상태 재사용, 끝에서 멈춤), 목차 선택 상자(`<select>`, 접근성 이름 번역)로 임의 챕터로 점프한다. `←`/`→`(이웃 파일)·PageUp/PageDown(스크롤)은 그대로.
  - 열려 있는 동안 다른 챕터로 넘어가면 본문 맨 위로 돌아간다. 요청 순번으로 늦게 온 응답을 버린다(Quick Look처럼).
  - 읽기 실패(DRM·깨짐·크기 초과)는 "미리 볼 수 없는 형식"처럼 두고 이유를 한 줄 보인다. 압축 파일 안 epub은 `epubOpen`을 부르지 않고 "미리 볼 수 없는 형식".
  - 문구는 ko·en 사전(영어 화면에서 영어), `docs/01`(VIEW-01), `docs/05`(챕터 키), `docs/07`, `README.md`와 `README.en.md`의 미리보기 표를 함께 고친다.
- 하지 않을 것: 압축 안 epub, 새 설정, 내부 링크·북마크·글꼴 크기 조절·검색, 편집(보기 전용, 복사 버튼 없음), 3D처럼 `kind` 새 종류 추가(프런트가 확장자로 고른다), `CHANGELOG.md`(릴리스 때).

## 기준 문서
- 관련 ADR: [ADR-0014](../../docs/adr/0014-macos-office-quicklook-preview.md). 용어: 없음. 선행: `epub-preview-1of2`, `ui/QuickLookView.tsx`(iframe·`layout`·시트 탭), `previewSheetsLoaded`/`previewSheetStep`(store).
- 완료 정의(DoD). 작성 시 기준선: `EpubView`·`epub-preview` 테스트 없음, vitest 실패 파일 기준선 2개(`model-formats`, `pdf-preview`).
  1. `cd apps/desktop && bunx vitest run src/__tests__/epub-preview.test.tsx`: `FakeBackend`에 시드한 epub(챕터 3개)을 Space로 열면 머리말에 제목·저자·표지 `<img>`가 있고, 목차 상자의 옵션이 챕터 제목 순서대로이며, 본문 iframe이 첫 챕터를 그린다. `Ctrl+Tab`이 2번째 챕터, 한 번 더 3번째, 끝에서 더 눌러도 3번째, `Ctrl+Shift+Tab`이 되돌아온다. 목차 상자로 점프하면 그 챕터다. 챕터를 바꾸면 본문 스크롤이 맨 위다. 사전 상태: 파일 없음.
  2. 같은 파일: 읽기 오류(시드한 DRM 오류)는 "미리 볼 수 없는 형식"과 이유, 압축 안 epub은 `epubOpen`이 불리지 않음, `←`/`→`는 이웃 파일 이동 그대로, 닫으면 Blob URL을 해제한다. 사전 상태: 없음.
  3. i18n: `i18n-keys`·`i18n-no-hardcoded`·`i18n-english-screens` 통과, 영어 화면에서 머리말·목차 상자 이름이 영어(`epub-preview` 테스트에 영어 케이스). 사전 상태: 통과(새 키를 추가하므로 앞으로 가는 확인은 DoD 1·2의 영어 케이스).
  4. 회귀: `bunx tsc --noEmit`, `bunx vitest run` 실패 파일 기준선 2개, `fkey-bindings`·`preview-sheets` 등 기존 시트 전환 테스트 그대로(`xlsx` 동작 불변).
  5. 실제 앱 확인(사람, jsdom은 WKWebView의 iframe 렌더링을 대신할 수 없다): 표지가 있고 이미지·CSS가 든 epub을 열어 본다 → 표지·제목·저자가 보이고, 본문이 읽을 수 있게 그려지며 이미지가 나온다, `Ctrl+Tab`으로 챕터가 넘어가고 목차 상자로 점프된다, 큰 epub에서도 막히지 않는다. 이상하게 그려지면 결과를 알려 주고 이슈로 남긴다. Windows는 별도 기기.

## 작업 조각
- [ ] S1. `EpubView`(머리말·목차 상자·iframe·레이아웃)와 `Preview.tsx` 분기(디스크 `.epub`만), `previewSheet` 연동, 테스트 먼저 — 완료 기준: DoD 1·2의 화면·키·오류 부분
- [ ] S2. 오류·압축 안·요청 순번·Blob 해제, ko·en 사전 — 완료 기준: DoD 2·3 (depends: S1)
- [ ] S3. 문서(`docs/01·05·07`, README 쌍), 회귀 — 완료 기준: DoD 4 (depends: S2)
