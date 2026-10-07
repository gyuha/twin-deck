<!-- forge-slug: draco-decoder-url -->
<!-- task: 90 -->
<!-- tdd: off -->
<!-- priority: high -->
# Draco 압축 glTF가 실제 앱에서 열리게 디코더 주소를 바로잡는다 (리뷰 C)

## Goal / Non-goals
- Goal: `loadModel`이 glTF의 외부 파일 주소를 바꾸는 URL 수정자를 건 `LoadingManager`를 `DRACOLoader`와 공유해서, 앱 자원인 `/draco/draco_wasm_wrapper.js`·`draco_decoder.wasm` 주소가 모델 폴더 아래의 없는 파일로 바뀌어 Draco 압축 glb가 "불러오기 실패"가 된다. `DRACOLoader`는 URL 수정자가 걸리지 않은 별도 매니저로 만들고, glTF가 가리키는 외부 텍스처·버퍼 주소는 여전히 `resolve`를 거치게 한다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- `ModelView.tsx`의 크기 상한·폴백(별도 작업)
- DRACOLoader 버전·디코더 파일 교체
- 다른 모델 형식 변경
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `lib/model/index.ts:96-101`의 `case "gltf"`. 리뷰에서 같은 규칙으로 요청 주소가 `asset://localhost/<모델폴더>//draco/…`로 바뀌는 것을 재현했다. `model-formats.test.ts`는 Node의 `draco3d`로 만든 로더를 직접 주입해 이 분기를 건너뛴다. `public/draco/`에 디코더 3개가 있고 `fixtures/models/tetra-draco.glb`가 있다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 신규 `apps/desktop/src/__tests__/model-draco-url.test.ts`(vitest)가 단언한다: (a) `dracoLoader`를 주입하지 않고 `loadModel("tetra-draco.glb", <fixtures/models/tetra-draco.glb>, { resolve })`를 부를 때 `fetch`를 스텁해 요청 주소를 기록하면 디코더 주소(`…/draco/draco_wasm_wrapper.js` 등)가 `resolve`를 거치지 않고(주소에 `asset:`·모델 폴더가 섞이지 않는다) 앱 자원 주소 그대로 요청된다 (b) 같은 `resolve`는 glTF의 외부 `uri`(`tri.gltf`의 버퍼/텍스처 상대 주소)에 대해서는 여전히 호출된다(`resolve` 스파이가 그 uri로 불림 — 모든 주소를 건너뛰어 통과하는 것을 막는다). 구현 전에 (a)가 실패(red)해야 한다.
  2. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음)

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `model-draco-url.test.ts`를 쓰고 red 기록 — completion criterion: DoD 1 (a) 구현 전 실패
- [ ] S2. `DRACOLoader`를 URL 수정자가 없는 매니저로 만든다 — completion criterion: DoD 1·2 green (depends: S1)
