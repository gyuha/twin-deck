# RUN — docx 미리보기에서 스크립트가 실행되지 않게 HTML을 정화한다 (리뷰 A)

- S1 red 테스트 — ✅ `office-sanitize.test.ts` 4건. 구현 전 2건 실패(스타일 맵 onerror, 정화 함수 부재), 나머지 2건은 사전 통과(정상 보존·`href` 제거는 기존 동작)
- S2 정화 — ✅ `includeEmbeddedStyleMap:false` + DOMPurify 허용 목록(`sanitizeDocxHtml` 내보냄, 태그 목록·속성 `colspan/rowspan/src/alt`·src는 `data:image/`만)

## DoD baseline → after
1. office-sanitize: 없음 → 4건 통과
2. `includeEmbeddedStyleMap` 0 → 1, `package.json`에 `dompurify` 추가
3. vitest 820 → 825 통과(model-formats 기준선 잡음 1파일), tsc 0, `tauri.conf.json` diff 없음

## 차이·메모
- 테스트 단언 보정: 첫 실행에서 `src`가 지워진 `<img>`를 위반으로 본 단언을 "src가 있으면 data:image/"로 고쳤다(위험 요소 검사는 그대로).
- CSP는 범위 밖이라 건드리지 않았다. 실제 앱에서 스크립트 실행이 막히는지는 확인하지 못했다(jsdom 기준).
