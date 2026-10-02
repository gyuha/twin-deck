<!-- forge-slug: markdown-preview -->
<!-- task: 5 -->
<!-- tdd: off -->
# 미리보기에서 .md 파일을 마크다운으로 렌더링

## 목표 / 비목표
- 목표: Space 미리보기 다이얼로그에서 확장자가 `.md`인 텍스트 파일을 마크다운으로 파싱해 보여 준다. `react-markdown` + `remark-gfm`을 쓴다.
- 비목표:
  - Rust 백엔드 변경, 편집 기능, 문법 강조, 새 단축키.
  - 링크 이동(클릭해도 이동하지 않음), 외부 브라우저 열기.
  - 마크다운 이미지 표시(대체 텍스트만 보여 준다).
  - `.md`가 아닌 텍스트 파일의 표시 변경(기존 `<pre>` 유지).

## 기준 문서
- 용어집: 미리보기(VIEW-01) — `.forge/CONTEXT.md`에서 해당 항목, 없으면 "없음"
- 관련 ADR: 없음
- 완료 정의(DoD): `.forge/loop.md`의 종료 조건 C1~C5 전부 통과.
  1. `bunx vitest run src/__tests__/markdown-preview.test.tsx` (cwd apps/desktop) → 통과 (사전: 파일 없음, 전진 확인. 제목·목록·코드블록·표 렌더링, 원문 기호 미노출, `<script>`/`onerror`/`javascript:` 차단, 링크 무이동, 이미지 대체 텍스트, 잘린 `.md`를 본다)
  2. `bunx vitest run src/__tests__/preview.test.tsx` → 통과 (회귀 방지: 착수 전 통과)
  3. `bunx vitest run`(cwd apps/desktop) → 실패 0, `bun run typecheck` → 종료 코드 0 (회귀 방지: 착수 전 297개 통과)
  4. 실제 앱(UAT): `.md`를 Space로 열어 제목·목록·표가 마크다운으로 보이는지 사용자가 확인한다. 실제 Tauri 웹뷰 렌더링이 필요해 명령으로 남길 수 없다.

## 작업 조각
- [ ] S1. `react-markdown`·`remark-gfm` 설치, 마크다운 렌더 컴포넌트(원시 HTML 미렌더, 링크 무이동, 이미지는 대체 텍스트), `Preview.tsx`에서 `.md` 텍스트에만 사용 — 완료 기준: DoD 1·2 충족.
- [ ] S2. 전체 회귀 확인 — 완료 기준: DoD 3 충족. (depends: S1)
