<!-- forge-slug: third-party-notices -->
<!-- task: 100 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 새 의존성과 번들 자산의 라이선스 고지를 채운다 (리뷰 M)

## Goal / Non-goals
- Goal: v0.5.1 이후 들어온 의존성·자산(three.js와 로더, OpenCascade wasm(LGPL-2.1), draco 디코더, mammoth, SheetJS, JSZip, react-colorful, DOMPurify)의 라이선스 고지가 `THIRD_PARTY_NOTICES.md`에 없다. 각 항목의 이름·버전·라이선스·출처를 실제 `package.json`과 `node_modules`의 LICENSE에서 확인해 적는다(추측하지 않는다).
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- 라이선스 호환성 법률 판단
- 의존성 교체
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `THIRD_PARTY_NOTICES.md`의 기존 형식을 따른다. 버전·라이선스는 각 패키지의 `package.json`/LICENSE 파일에서 읽는다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. `for n in three mammoth xlsx jszip react-colorful dompurify opencascade draco; do grep -ci $n THIRD_PARTY_NOTICES.md; done`의 모든 값이 ≥ 1 (착수 전 일부가 0)
  2. 각 항목의 라이선스 문자열이 해당 패키지 `package.json`의 `license` 값과 일치한다(실행한 비교 결과를 run.md에 적는다)

## Work slices
- [ ] S1. 고지 항목을 확인해 추가 — completion criterion: DoD 1·2
