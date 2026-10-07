# RUN — 3D 모델 미리보기에 크기 상한·오류 정리·텍스트 폴백을 둔다 (리뷰 D)

- S1 red 테스트 — ✅ `model-view-limits.test.tsx` 4건. 구현 전 4건 모두 의도한 이유로 실패(상한 무시·dispose/forceContextLoss 미호출·폴백 없음·압축 안 모델에도 3D 뷰어)
- S2 구현 — ✅ `MODEL_MAX_BYTES`(100MB), `ModelView`에 `size`·`fallback` props, 오류 경로에서도 `dispose`+`forceContextLoss`, 압축 경로(`isArchivePath`)는 3D 뷰어 제외, `Preview`의 텍스트 본문을 `textBody`로 빼 폴백에 재사용

## DoD baseline → after
1. 4건: red → 통과
2. 기존 `model-preview`·`model-view-dispose` 5건: 통과 유지(아래 차이 참조)
3. vitest 827 → 831 통과(model-formats 기준선 1파일), tsc 0

## 차이·메모
- 폴백 범위를 좁혔다: 읽기·해석 실패와 크기 초과(`soft` 오류)에서만 텍스트로 돌아가고, WebGL을 못 쓰는 경우는 기존 테스트가 고정한 대로 안내 문구만 보인다.
- 실제 WebGL 앱에서의 동작과 100MB 상한값의 적절성은 확인하지 못했다(상한 값은 제가 정했다).
