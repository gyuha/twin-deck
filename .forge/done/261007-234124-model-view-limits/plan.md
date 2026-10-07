<!-- forge-slug: model-view-limits -->
<!-- task: 91 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 3D 모델 미리보기에 크기 상한·오류 정리·텍스트 폴백을 둔다 (리뷰 D)

## Goal / Non-goals
- Goal: `ModelView`는 파일 크기를 보지 않고 전체를 읽어 메인 스레드에서 동기 파싱하고, 오류 경로에서 WebGL 렌더러를 해제하지 않으며, 예전에 텍스트로 열리던 `.obj`·`.gcode`·`.stl`·`.ply`가 3D 로드에 실패하면 돌아갈 곳이 없고, 압축 파일 안 모델은 asset 프로토콜 404가 된다. (1) 파일 크기 상한(`MODEL_MAX_BYTES`, 100MB)을 넘으면 읽지 않고 안내만 보인다 (2) 오류 경로와 성공 경로 모두에서 렌더러를 `dispose` + `forceContextLoss`한다 (3) 3D 로드가 실패하면 텍스트 형식(obj·gcode·stl·ply 등 서비스가 텍스트로 구분하는 것)은 텍스트 미리보기로 돌아간다 (4) 압축 파일 안 경로(`!`가 든 경로)는 3D 뷰어를 쓰지 않고 "기타" 미리보기로 둔다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- Office 상한(별도 작업)
- glTF 외부 주소 차단(별도 작업)
- 모델 로더·형식 추가
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `ModelView.tsx`(렌더러 생성 28행, fetch 33행, catch), `Preview.tsx:131-133`이 모델 확장자면 `kind`와 무관하게 `ModelView`를 쓴다. 기존 테스트 `model-preview.test.tsx`, `model-view-dispose.test.tsx`(성공 경로 dispose).
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 신규 `apps/desktop/src/__tests__/model-view-limits.test.tsx`(vitest)가 단언한다: (a) 크기가 상한을 넘는 미리보기에서 `fetch`가 모델 주소로 호출되지 않고 안내가 보인다 (b) `fetch`가 `!ok`일 때 `WebGLRenderer.dispose`와 `forceContextLoss`가 호출된다(가짜 three 렌더러를 주입) (c) 텍스트 형식(`.obj`)의 3D 로드가 실패하면 텍스트 미리보기 본문이 보인다 (d) 압축 안 경로(`/a.zip!/m.obj`)에서는 `fetch`가 호출되지 않는다. 구현 전에 (a)~(d)가 실패(red)해야 한다.
  2. 기존 `model-preview.test.tsx`, `model-view-dispose.test.tsx`가 의미 변경 없이 통과한다
  3. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음)

## Work slices
- [ ] S1. 먼저 실패하는 테스트 — completion criterion: DoD 1 구현 전 실패
- [ ] S2. 크기 상한·dispose·폴백·압축 경로 처리 — completion criterion: DoD 1·2 green (depends: S1)
