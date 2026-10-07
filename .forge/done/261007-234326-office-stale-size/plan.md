<!-- forge-slug: office-stale-size -->
<!-- task: 92 -->
<!-- tdd: off -->
<!-- priority: medium -->
# Office 미리보기가 이전 파일의 크기로 상한을 판단하지 않게 한다 (리뷰 E)

## Goal / Non-goals
- Goal: 미리보기 항목을 넘기는 동안 `loadPreview`가 이전 파일의 `data`를 남기고 `Preview.tsx`가 `d && office`만 보고 `OfficeView`를 새 경로 + 이전 크기로 마운트해, 작은 파일에서 20MB 넘는 문서로 넘어가면 상한 검사를 통과해 읽기·파싱이 시작되고 이후 이중으로 읽는다. 새 항목의 데이터(`status: ready`이고 데이터가 그 경로의 것)가 올 때만 `OfficeView`·`ModelView`를 마운트하고, `OfficeView`의 읽기는 `AbortController`로 취소할 수 있게 한다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- 20MB·100MB 상한 값 변경
- xlsx/pptx 표시 변경
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `Preview.tsx:131-133`, `OfficeView.tsx:16-35`, `store.ts` `loadPreview`(로딩 중 `data: s.preview?.data`). 기존 `office-preview.test.tsx`의 21MB 케이스는 처음 여는 경우만 시험한다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 신규 `apps/desktop/src/__tests__/office-stale-size.test.tsx`(vitest)가 단언한다: 작은 텍스트 파일 미리보기에서 21MB(크기만 큰 가짜) docx로 방향키 이동할 때 새 항목의 데이터가 오기 전까지 `fetch`(`api.fileUrl`)가 그 docx 주소로 호출되지 않고, 이후 크기 초과 안내가 한 번만 보인다. 작은 docx → 다른 작은 docx 이동에서는 각 파일을 정확히 한 번씩만 읽는다. 구현 전에 실패(red)해야 한다.
  2. 기존 `office-preview.test.tsx`가 통과한다
  3. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음)

## Work slices
- [ ] S1. 먼저 실패하는 테스트 — completion criterion: DoD 1 구현 전 실패
- [ ] S2. 준비된 데이터가 새 경로의 것일 때만 마운트하고 읽기를 취소 가능하게 한다 — completion criterion: DoD 1·2 green (depends: S1)
