# 실행 기록 — docx·xlsx·pptx 첫 부분 미리보기

워크플로우 없이 한 세션에서 직접 처리했다(규모가 작아 서브에이전트 비용이 더 크다).

## 조각별 결과
- S1 형식 판별 `lib/office/kinds.ts` — ✅ 계획대로
- S2 의존성 추가(mammoth·jszip·SheetJS tarball) — ⚠ `bun.lock`에 xlsx 항목은 있으나 무결성 해시가 없다(tarball URL 의존이라 레지스트리 해시가 안 붙는다). 계획은 "락파일 무결성 해시로 고정"이라 썼다.
- S3 읽기 모듈 `lib/office/index.ts` — ⚠ mammoth를 `mammoth/mammoth.browser`로 직접 가져온다(Node 진입점은 `arrayBuffer` 입력을 못 받아 vitest에서 실패). 그래서 `lib/office/mammoth.d.ts` 타입 선언이 하나 더 생겼다. pptx는 `slide1.xml` 고정이라 프레젠테이션 순서상 첫 슬라이드와 다를 수 있다.
- S4 `OfficeView` + `Preview.tsx` 연결 — ✅ 계획대로(추가 요구의 "실제 화면과 다름" 안내 포함)
- S5 `docs/01-feature-spec.md` VIEW-01 — ✅ 계획대로

## DoD (baseline → after)
1. tsc: 통과 → 통과 (회귀 방지)
2. vitest 전체: 실패 3건(audio-preview, preview-scroll PDF, theme) → 같은 3건, 새 실패 0건. 통과 795 → 809
3. 새 테스트: 파일 없음 → `office-formats` 7건 + `office-preview` 7건 통과
4. 20MB 초과: 미구현 → 테스트 통과(fetch 호출 0회)
4b. "실제 화면과 다름" 안내: 미구현 → 세 형식 모두 테스트 통과
5. `grep -c docx docs/01-feature-spec.md`: 0 → 1
6. Rust·바인딩 diff: 비어 있음 → 비어 있음 (회귀 방지)
7. 실제 앱 확인: **미실시** — 사람이 확인해야 한다.

## 추가로 본 것
- `vite build`가 통과하고 mammoth(304 kB)·xlsx(500 kB)·jszip(97 kB)이 별도 청크로 나뉜다 → 해당 형식을 처음 열 때만 불러온다.
- 속도 측정(큰 docx·xlsx)은 하지 못했다. 합성 소형 파일만 썼다.

## UAT 중 추가 요청
- "실제 화면과 다름" 안내를 하단에서 **상단 가운데**로 옮기고 경고색 상자(`role="note"`, 스크롤해도 따라오는 sticky)로 눈에 띄게 했다. 이유: 하단 안내는 긴 docx·xlsx에서 스크롤 밖이라 보이지 않았다. 계획의 "하단" 문구는 이에 따라 바뀐 상태이며, `docs/01-feature-spec.md`도 "상단 가운데"로 고쳤다. 테스트 14건·tsc 통과.
