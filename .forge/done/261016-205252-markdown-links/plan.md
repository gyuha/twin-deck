<!-- forge-slug: markdown-links -->
<!-- task: 191 -->
<!-- tdd: off -->
# Markdown 미리보기의 외부·내부 링크를 동작하게 한다 (이슈 #89)

## 목표 / 하지 않을 것
- 목표: Markdown 미리보기의 링크가 눌린다. (1) 외부 `http(s)://`·`mailto:`는 기본 브라우저·메일 앱으로 연다. (2) 같은 문서 안 `#제목`은 그 제목으로 스크롤한다. (3) 상대 경로(`./a.md`, `docs/b.md`, `../c.md`)는 그 항목으로 간다: 파일은 미리보기로 열고, 폴더는 패널이 그 폴더로 이동한다. 없는 항목은 안내만 띄운다. (4) 그 밖의 스킴(`javascript:`·`file:`·`data:` 등)은 눌러도 아무 일도 없다.
- 원인: `MarkdownView`가 링크(`a`)를 클릭할 수 없는 `<span>`으로만 그린다("링크는 이동하지 않는다"). 앱에는 URL을 여는 명령도 없다(릴리스 페이지 하나만 상수 주소로 연다).
- 하지 않을 것: 보안상 `javascript:`·`file:` 허용, 호버로 주소 미리 보기, 다른 미리보기(epub·Office·HWP)의 링크, `파일.md#제목`의 제목까지 스크롤(파일만 연다), 버전·`CHANGELOG.md`·배포·push.

## 기준 문서
- 용어집: 없음. 관련 ADR: 없음(되돌리기 쉬운 UI 동작이라 ADR 조건을 채우지 않는다).
- 완료 정의(DoD): `.forge/loop.md`의 C1~C4와 같다(여기에 다시 적지 않는다).

## 작업 쪼개기
- [ ] S1. Rust: `td_launch`의 `Launch::open`(OS 기본 열기)을 재사용해 `Service`·명령 `open_external_url(url)`을 만든다. 허용은 `http`·`https`·`mailto`만(대소문자 무시, 공백·제어 문자·빈 문자열 거부). 시험 이름에 `외부_주소`를 넣는다(C1). `task gen-types` → `backend.ts`·`tauri.ts`·`fake.ts`(`openedUrls` 기록)·`store.ts` 체인. — 완료 기준: C1, C3
- [ ] S2. UI: `MarkdownView`의 `a`를 눌리는 요소로 바꾼다(`Enter` 포함). 제목(h1~h6)에 GitHub 방식 슬러그 id를 단다(중복은 `-1`…). 링크 종류를 가려 처리한다: 외부 → `api.openExternalUrl`, `#…` → 같은 문서 제목으로 `scrollIntoView`, 상대 경로 → 새 스토어 액션 `previewLink(path)`(파일이면 미리보기로 열고 폴더면 이동, 없으면 안내), 나머지 → 무시. 상대 경로는 이미지와 같은 규칙(`resolveMarkdownImage`의 폴더 걷기)으로 푼다. — 완료 기준: C2, C3 (depends: S1)
- [ ] S3. 문서: README 한 쌍, `docs/07-ui-spec.md`, `docs/01-feature-spec.md`에 "Markdown 링크"를 쓴다. — 완료 기준: C4 (depends: S2)
