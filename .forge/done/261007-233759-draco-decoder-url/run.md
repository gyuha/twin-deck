# RUN — Draco 압축 glTF가 실제 앱에서 열리게 디코더 주소를 바로잡는다 (리뷰 C)

- S1 red 테스트 — ✅ `model-draco-url.test.ts` 2건. 구현 전 (a)가 `asset://localhost/models///draco/…`로 변조된 디코더 주소를 잡아 실패, (b) 외부 uri는 resolve를 거친다는 단언은 사전 통과(가드)
- S2 수정 — ✅ `DRACOLoader`를 URL 수정자가 걸린 매니저와 분리(`new DRACOLoader()`)

## DoD baseline → after
1. (a) 디코더 주소 변조: 재현 → 해소, (b) 외부 uri resolve 보존: 통과 유지
2. vitest 825 → 827 통과(model-formats 로드 실패 1파일은 기준선), tsc 0

## 차이·메모
- 테스트 환경 보정: jsdom ArrayBuffer realm 문제(기존 테스트와 같은 우회), 메시가 버퍼·텍스처를 쓰도록 glTF를 구성해야 로더가 외부 파일을 요청한다.
- 실제 WebGL 앱에서 Draco glb를 열어 보지는 못했다(디코더 주소 단위에서만 검증).
