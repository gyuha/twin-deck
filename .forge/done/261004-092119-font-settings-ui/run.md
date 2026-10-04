# RUN — UI 글꼴·미리보기 글꼴을 화면에 적용하고 설정 화면에 입력칸 추가 (font-settings-ui)

워크플로 없이 직접 실행했다(작은 작업).

- S1 `ui/fonts.ts`(`useUiFont`, `usePreviewFont`) 추가. `App.tsx`가 `<body>` 글꼴을 설정에 맞추고, 미리보기 4종(텍스트·코드·JSON·Markdown)의 본문 요소에 인라인 글꼴 적용 — ✅ 계획대로
- S2 설정 화면 "모양" 섹션에 "UI 글꼴"·"미리보기 글꼴" 텍스트 입력칸 추가, `fonts.test.tsx` 8개 테스트 — ✅ 계획대로

## 어긋난 점
- 계획은 CSS 적용만 적었는데, 본문 `pre`/`code`의 `font-mono` 클래스가 상속을 막아서 CSS 변수 대신 요소별 인라인 `style`로 줬다(jsdom 테스트에서 실제 적용값을 단언하기 위해서이기도 하다).
- 마크다운 미리보기에는 `pre`와 `code` 요소에도 따로 줬다.

## DoD baseline → after
- fonts.test.tsx 테스트: 0개 → 8개 통과
- vitest 전체: 496 통과·실패 1 → 504 통과·실패 1(기존 `pdf-preview`)
- `bunx tsc --noEmit`: 오류 없음 → 오류 없음
- `cargo test --workspace`, fmt, clippy: 통과 → 통과
- 앱에서 직접 화면으로 확인하지는 않았다(jsdom 테스트로만 확인).
