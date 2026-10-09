<!-- forge-slug: markdown-relative-images -->
<!-- task: 126 -->
<!-- tdd: off -->
# 마크다운 미리보기에서 상대경로 이미지를 보여 준다 (이슈 #42)

## 목표 / 하지 않을 것
- 목표: 디스크의 `.md` 미리보기에서 `![](img/a.png)` 같은 상대경로 이미지를 md가 있는 폴더 기준으로 풀어 asset 프로토콜 주소(`api.fileUrl`)로 보여 준다. `./`·`../`·`%20`(공백) 처리.
- 하지 않을 것: 바깥 주소(`https:` 등)·`data:`·`javascript:`·절대경로 이미지 렌더, 압축 안 마크다운의 이미지, 링크 이동, 원시 HTML 렌더.

## 기준 문서
- 관련 ADR·용어: 없음. 완료 정의(DoD): `.forge/loop.md`의 C1~C4.

## 작업 조각
- [ ] S1. `MarkdownView`가 폴더 경로와 변환 함수를 받아 상대 `src`를 풀고 `<img>`로 그림, `Preview.tsx`에서 전달 — 완료 기준: C1·C2
- [ ] S2. `markdown-images.test.tsx`와 문서, 회귀 — 완료 기준: C1~C4 (depends: S1)
