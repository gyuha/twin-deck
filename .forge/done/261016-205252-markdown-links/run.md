# 실행 기록 — Markdown 미리보기의 외부·내부 링크 (task #191, 이슈 #89)

## 슬라이스 결과
- S1 Rust·브리지 — ✅ 계획대로. `open_external_url(url)`: 스킴을 `http`·`https`·`mailto`로 한정하고 공백·제어 문자·빈 값·`http:`/`http://`/`https:///x`/`mailto:`만 있는 값을 거부, 통과하면 `Launch::open`(OS 열기 명령)으로 넘긴다. 시험 3개(`외부_주소…`: 허용·거부·실패 전파). `gen-types`와 `backend.ts`·`tauri.ts`·`fake.ts`(`openExternalUrl`, 연 주소는 `openedUrls`)·`store.ts` 체인.
- S2 UI — ✅ 계획대로. 시험을 먼저 쓰고 9개 중 7개 실패를 확인한 뒤(링크가 `<span>`이라 `role=link` 없음) 구현했다. `MarkdownView`: `classifyLink`(외부/`#제목`/상대 경로/무시), 제목 h1~h6의 GitHub 방식 id(`headingId`), 눌리는 `<a role="link">`(클릭·`Enter`, 앱 화면이 링크 주소로 바뀌지 않게 `preventDefault`, `Enter`는 `stopPropagation`). 스토어 `previewLink(path)`(파일이면 그 폴더로 패널을 옮겨 커서를 맞추고 미리보기로 열기, 폴더면 미리보기를 닫고 이동, 없으면 안내). 상대 경로를 푸는 폴더 걷기는 `resolveRelative`로 뽑아 이미지 해석과 공유했다.
- S3 문서 — ✅ README 한 쌍, `docs/07`, `docs/01` VIEW-01.

## 계획과 달라진 점
- ⚠ **기존 시험 한 줄을 의도적으로 바꿨다**: `markdown-preview.test.tsx`의 "스크립트·onerror·javascript: 링크·이미지를 DOM에 넣지 않는다"가 `a` 요소가 아예 없음을 단언했는데, 이제 링크는 `<a>`로 그려진다. 보안 의도(위험한 `href`가 DOM에 없다)는 그대로 지키고 단언을 "어떤 `a`도 `href`에 `javascript:`를 갖지 않는다"로 고쳤다(ReactMarkdown이 위험한 `href`를 지우고, 앱은 그 링크를 눌러도 무시한다). 시험을 느슨하게 한 것이 아니라 바뀐 동작에 맞춘 것이다.
- ⚠ 안내 문구 상수 주석 갱신: `RELEASES_URL` 주석이 "임의 URL을 받는 명령은 두지 않는다"고 했는데 이제 스킴을 한정한 임의 외부 주소 명령이 있다. 주석을 현실에 맞췄다.
- ⚠ 새 Rust 문구 2개의 영어 대응을 `i18n/rust.ts`에 더했다(대응표 검사).
- ⚠ **한계(문서에도 적었다)**: `파일.md#제목`은 파일만 열고 제목까지 스크롤하지 않는다. 같은 제목이 둘이면 첫 번째로 간다. `/`로 시작하는 경로 링크는 무시한다. Office 문서의 Markdown 본문은 외부 링크만 열린다.
- ⚠ **확인하지 못한 것**: 실제 앱(WKWebView)에서 링크를 눌러 브라우저가 열리는지, Windows의 `explorer <URL>` 동작.

## 검사 결과(loop.md)
- C1 `외부_주소` 통과 개수: 0 → 3
- C2 `markdown-links.test.tsx`: 파일 없음 → 9 passed(구현 전 7개 실패 확인)
- C3 vitest 전체 1453 passed · tsc 0 · `cargo test -p twin-deck-desktop` 161 passed · fmt ok · clippy ok
- C4 문서: 0/0 → 3/1
