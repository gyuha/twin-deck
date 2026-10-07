<!-- forge-slug: docx-preview-sanitize -->
<!-- task: 88 -->
<!-- tdd: off -->
<!-- priority: high -->
# docx 미리보기에서 스크립트가 실행되지 않게 HTML을 정화한다 (리뷰 A)

## Goal / Non-goals
- Goal: mammoth가 docx에 든 스타일 맵(`mammoth/style-map`)을 그대로 적용해 `onerror` 같은 속성이 든 HTML이 만들어지고, `OfficeView`가 이를 `dangerouslySetInnerHTML`로 꽂아 악성 docx 미리보기만으로 앱 명령이 실행될 수 있다. mammoth 호출에 `includeEmbeddedStyleMap: false`를 주고, 결과 HTML을 DOMPurify(새 의존성, `apps/desktop`)의 허용 목록으로 정화한다(문단·제목·표·목록·굵게·기울임·`img[src=data:image/*]`만, `on*` 속성·script·iframe·svg·style·link·form·`javascript:` 주소 제거). 기존의 링크 `href` 제거와 100블록 자르기는 그대로다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- `tauri.conf.json`의 CSP 변경
- xlsx·pptx 미리보기 변경
- Office 크기 상한 변경(별도 작업)
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `lib/office/index.ts`의 `readDocx`가 mammoth 결과를 DOMParser로 풀어 `a`의 href만 지우고 `body.innerHTML`을 돌려준다. `OfficeView.tsx:50`이 그 HTML을 그대로 꽂는다. 리뷰에서 `p => img[src='x'][onerror='alert(1)']` 스타일 맵 docx가 `onerror`가 남은 HTML을 만드는 것을 재현했다. `office-fixtures.ts`의 `makeDocx(n)`가 정상 docx를 만든다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 신규 `apps/desktop/src/__tests__/office-sanitize.test.ts`(vitest)가 값으로 단언한다: (a) JSZip으로 만든 악성 docx(스타일 맵 `p => img[src='x'][onerror='alert(1)']`, 그리고 문서 본문에 `<w:hyperlink>` 등 일반 요소)를 `readOffice("docx", …)`에 넣으면 결과 html에 `on\w+=`·`<script`·`<iframe`·`<svg`·`<style`·`<link`·`javascript:`가 하나도 없고 `img`의 `src`는 `data:image/`로 시작하는 것만 남는다 (b) 정상 docx(`makeDocx(3)`)는 문단 텍스트와 `<p>`가 그대로 보존되고 표(`<table>`)·굵게(`<strong>`)가 든 docx는 그 태그가 남는다(전부 지워서 통과하는 것을 막는다) (c) 정화 함수에 직접 넣은 `<img src=x onerror=1>`, `<a href="javascript:1">x</a>`, `<svg onload=1>`, `<p style="background:url(//x)">`도 위험 요소가 사라진다. 구현 전에 (a)(c)가 실패(red)해야 한다.
  2. `grep -c includeEmbeddedStyleMap apps/desktop/src/lib/office/index.ts` ≥ 1, `apps/desktop/package.json`에 `dompurify`가 있다 (착수 전 둘 다 0)
  3. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음), `git diff --stat -- apps/desktop/src-tauri/tauri.conf.json`이 비어 있다

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `office-sanitize.test.ts`를 쓰고 red 기록 — completion criterion: DoD 1 (a)(c) 구현 전 실패
- [ ] S2. `bun add dompurify`(+타입), `readDocx`에 `includeEmbeddedStyleMap:false`와 허용 목록 정화를 넣는다 — completion criterion: DoD 1·2 green (depends: S1)
