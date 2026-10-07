<!-- forge-slug: gltf-block-remote -->
<!-- task: 97 -->
<!-- tdd: off -->
<!-- priority: medium -->
# glTF가 외부 https 주소와 모델 폴더 밖 경로를 읽지 않게 한다 (리뷰 K)

## Goal / Non-goals
- Goal: `ModelView`의 URL 해석이 `https?:`를 그대로 통과시켜, 받은 `.gltf`를 미리보기만 해도 외부 서버로 요청이 나가고(트래킹), `../`로 모델 폴더 밖 경로도 막지 않는다. 해석 함수를 `lib/model`로 빼서 (1) `data:`·`blob:`과 앱 자원 주소(`asset:`, `http(s)://asset.localhost`)만 통과 (2) 그 밖의 `http(s):` 주소는 차단(빈 주소) (3) 상대 주소는 디코드 뒤 `..`·절대 경로(`/`, `C:`)를 거부하고 모델 폴더 아래로만 푼다. 테스트용 `fake-asset:`은 운영 정규식에서 빼고 테스트가 주입한다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- 크기 상한·폴백(별도 작업)
- CSP
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `ModelView.tsx:7` `EXTERNAL` 정규식과 37행 `resolve`. `FakeBackend.fileUrl`(`fake.ts:342`)이 `fake-asset:`을 쓴다. `TauriBackend.fileUrl`은 `convertFileSrc`.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 신규 `apps/desktop/src/__tests__/model-gltf-remote.test.ts`(vitest)가 단언한다: 해석 함수에 (a) `https://x.example/p.png` → 차단 (b) `../../secret.bin`·`/etc/passwd`·`C:\\x` → 차단 (c) `data:image/png;base64,AA`·`blob:…` → 그대로 (d) `tex/a%20b.png` → 모델 폴더 아래 주소로 풀림 (e) 앱 자원 주소 → 그대로. 구현 전에 (a)(b)가 실패(red)해야 한다.
  2. 기존 `model-preview.test.tsx`·`model-view-dispose.test.tsx`가 통과한다(`FakeBackend` 주소를 테스트가 주입해도 통과해야 한다)
  3. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음)

## Work slices
- [ ] S1. 먼저 실패하는 테스트 — completion criterion: DoD 1 구현 전 실패
- [ ] S2. 해석 함수를 `lib/model`로 빼고 규칙 적용 — completion criterion: DoD 1·2 green (depends: S1)
