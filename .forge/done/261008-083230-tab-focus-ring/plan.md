<!-- forge-slug: tab-focus-ring -->
<!-- task: 106 -->
<!-- tdd: off -->
# 탭을 클릭한 뒤 미리보기를 열면 탭에 생기는 테두리를 없앤다 (이슈 #28)

## Goal / Non-goals
- Goal: 탭을 마우스로 클릭한 뒤 파일 미리보기(키보드 조작)를 하면 그 탭 버튼에 파란 사각 테두리가 생기는 증상을 없앤다. 원인은 탭 버튼(`TabBar.tsx`)이 `tabIndex={-1}`이라 키보드 대상은 아니지만 클릭하면 포커스를 받고, 앱 CSS에 포커스 링을 끄는 규칙이 없어 WebKit이 키보드 조작 중 브라우저 기본 포커스 링을 그리는 것이다(스크린샷 기준 추정, 실제 앱 확인 전). 해결은 탭 버튼(칸형·일반형, 활성·비활성 모두)에 `outline-none`을 준다. 활성 탭 표시(밑줄·배경)는 그대로다.
- 요청 경위: GitHub 이슈 #28(작성자 본인): 탭 클릭 후 미리보기를 실행하면 탭에 테두리가 생긴다(스크린샷).
- Non-goals: 다른 버튼·입력창의 포커스 표시, 패널 활성 테두리, 탭 키보드 이동, 포커스 처리 구조 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #28
- 사전 확인(작성 시점): `ui/TabBar.tsx`의 탭 `button`은 `role="tab"`·`tabIndex={-1}`, `className`에 outline 관련 클래스가 없다. `src/index.css`·`theme.css`에도 `outline`/`focus` 규칙이 없다. 경로 입력창(`Breadcrumb.tsx`)은 이미 `outline-none`을 쓴다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 925건 통과 + `model-formats.test.ts` 1파일 로드 실패(기준선 잡음), `tsc` 0, `git diff -- crates apps/desktop/src-tauri` 비어 있음):
  1. 신규 `apps/desktop/src/__tests__/tab-focus-ring.test.tsx`가 단언한다: 앱을 렌더한 뒤 탭을 여러 개 만들면 모든 `role="tab"` 버튼(활성·비활성)의 class에 `outline-none`이 있고, 탭을 클릭해 포커스를 준 뒤에도 같다. 한계: jsdom은 CSS를 계산하지 않으므로 이 테스트는 "클래스가 붙어 있다"만 보증한다(실제 링이 사라지는지는 실앱 확인 필요).
  2. 칸형(`segments`) 탭 배치에서도 같은 단언이 성립한다(설정으로 칸형을 켠 앱).
  3. 기존 TabBar·탭 관련 테스트(`tab-*`·`drag-drop`·`tabs`)가 의미 변경 없이 통과한다.
  4. 회귀 방지: `bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 `model-formats.test.ts` 외에 실패하는 파일이 없고, `git diff --stat -- crates apps/desktop/src-tauri`가 비어 있다.

## Work slices
- [ ] S1. `TabBar.tsx` 탭 버튼에 `outline-none` 추가와 `tab-focus-ring.test.tsx` — completion criterion: DoD 1·2·3·4 green
