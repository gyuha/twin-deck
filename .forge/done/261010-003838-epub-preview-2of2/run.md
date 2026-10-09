<!-- forge-slug: epub-preview-2of2 -->
# 실행 기록 — epub 미리보기 (2/2) UI

## 한 일
- `ui/EpubView.tsx`(새): 머리말(표지·제목·저자), 목차 선택 상자(`<select>`), 현재 챕터를 스크립트 없는 격리 iframe(Blob URL)로. 요청 순번으로 늦은 응답 폐기, 챕터 바꿀 때 본문 맨 위로·이전 Blob URL 해제, 읽기 오류는 `미리 볼 수 없는 형식입니다 (이유)`.
- `ui/Preview.tsx`: 디스크 위 `.epub`이면 `EpubView`, 압축 안이면 `epubOpen` 없이 기존 "미리 볼 수 없는 형식".
- `state/store.ts`: `epubOpen`/`epubChapter` 통과 함수. 챕터 이동은 기존 `previewSheet` 상태와 `core.preview.next_sheet`/`prev_sheet`(`Ctrl+Tab` 계열)를 재사용.
- i18n ko·en 키 4개, `epub-preview.test.tsx` 7개.
- 문서: `docs/01`(VIEW-01)·`docs/05`(시트/챕터 키)·`docs/07`, `README.md`·`README.en.md` 미리보기 표.

## 계획과 실제 (차이)
- 챕터 이동은 계획에 "끝에서 멈춤"이라 썼지만 재사용한 시트 액션이 **끝에서 처음으로 돌아가므로** xlsx와 같게 두었다(테스트도 그렇게 단언).
- 이웃 파일 이동 키는 계획의 `←`/`→`가 아니라 실제 앱의 `↑`/`↓`다. 테스트는 `↑`/`↓`로 확인.
- TDD: UI는 구현을 먼저 쓰고 테스트를 이어서 썼다(1of2와 같은 한계).

## 검증
- C1 epub 12개, C2 up_to_date+bindings, C3 epub-backend 4+epub-preview 7, C4 tsc·vitest(실패 기준선 2개 파일뿐, 1113 통과)·i18n 4개 파일 21·clippy·fmt·cargo test 96, C5 문서 5개 모두 epub 언급.
- 남은 확인(사람, 자동화 불가): 실제 epub(표지·이미지·CSS가 든 것)을 앱에서 열어 WKWebView에서 본문이 읽기 좋게 그려지는지, 이미지가 나오는지, 큰 epub에서도 막히지 않는지. 합성 샘플로만 시험했다. Windows는 별도 기기.
