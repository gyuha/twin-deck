<!-- forge-slug: markdown-relative-images -->
# 실행 기록 — 마크다운 상대경로 이미지 (이슈 #42)

## 한 일
- `ui/MarkdownView.tsx`: `resolveMarkdownImage`(상대 `src`를 md 폴더 기준 `fileUrl`로, `./`·`../`·`%20`·`?#` 처리, 스킴·절대경로·압축 안·루트 이탈은 null)와 `resolveImage` prop. 주소가 있으면 `<img>`, 없으면 alt만.
- `ui/Preview.tsx`: `resolveImage`로 `api.fileUrl` 연결.
- `__tests__/markdown-images.test.tsx`: 5개(상대경로 4종·%20·쿼리, 바깥/스크립트/데이터/절대 불가, 루트 이탈, 압축 안, Windows 경로).
- `docs/07-ui-spec.md`에 설명 추가.

## 계획과 실제
- 계획과 같다. 차이 없음.

## 검증
- C1~C4: markdown-images 5 통과, markdown-preview 4 통과, tsc 통과, vitest 1100 통과·실패는 기준선 2개 파일뿐.
- 실제 앱(WKWebView)에서 asset 프로토콜로 이미지가 뜨는지는 눈으로 확인하지 못했다(video가 같은 프로토콜로 동작하는 것으로 미루어 짐작).
