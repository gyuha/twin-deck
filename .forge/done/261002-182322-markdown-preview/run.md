# RUN — 미리보기에서 .md 파일을 마크다운으로 렌더링
slug: markdown-preview

## 슬라이스 결과
- S1 react-markdown·remark-gfm 설치, MarkdownView 컴포넌트, Preview.tsx의 .md 분기 — ✅ 계획대로 (타입 오류 1건: `d.text`가 `string | null`이라 `?? ""` 추가)
- S2 전체 회귀 확인 — ✅ 계획대로

## DoD baseline → after
- DoD 1 `markdown-preview.test.tsx`: 파일 없음 → 3개 통과
- DoD 2 `preview.test.tsx`: 10개 통과 → 10개 통과 (회귀 방지, 변화 없음)
- DoD 3 전체 `vitest run`: 297개 통과 → 300개 통과, `bun run typecheck` 오류 0
- DoD 4 실제 앱 UAT: 사람 확인 필요 (아래 STATUS 참고)

## 결정·차이
- 링크는 `<a>`를 만들지 않고 `<span>`으로 렌더링해 이동 자체를 막음. 이미지는 대체 텍스트 `<span>`.
- react-markdown은 원시 HTML을 렌더링하지 않아 `<script>`·`onerror`는 DOM에 들어오지 않음(테스트로 확인).
- 워크플로우 없이 직접 구현(변경이 프런트엔드 몇 파일 규모).
