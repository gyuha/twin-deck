# RUN — glTF가 외부 https 주소와 모델 폴더 밖 경로를 읽지 않게 한다 (리뷰 K)

- S1 red 테스트 — ✅ `model-gltf-remote.test.ts` 5건. 구현 전에는 해석 함수(`lib/model/uri.ts`)가 없어 import 실패로만 red였다(동작 수준의 red는 아니다). 대신 옛 규칙(`EXTERNAL` 정규식)이 `https?:`를 그대로 통과시키고 `..`를 정규화하지 않았음을 코드로 확인했다
- S2 구현 — ✅ `resolveModelUri(uri, dir, fileUrl)`: data·blob·앱 자원 주소(`fileUrl("/")`의 `scheme://host`로 판단)만 통과, 그 밖의 스킴·`//host`·절대 경로·`..`·깨진 인코딩은 빈 문자열로 막고 상대 경로는 모델 폴더 아래로만 푼다. `ModelView`가 이를 쓰고 `fake-asset:`을 운영 정규식에서 뺐다

## DoD baseline → after
1. 5건 통과(차단: 외부 서버·file·javascript·`//`, `../`·절대·`C:\`·`..%2F`·역슬래시, 통과: data·blob·앱 주소, 디코드: 공백·한글·`./`)
2. 기존 `model-preview`·`model-view-dispose`·`model-view-limits`·`model-draco-url` 통과 유지
3. vitest 840 → 845 통과(기준선 1파일), tsc 0

## 차이·메모
- 외부 주소를 막으면 원격 텍스처를 쓰는 .gltf는 텍스처 없이(실패) 보일 수 있다 — 의도한 동작이다.
- Windows의 `http://asset.localhost/…` 형태는 `fileUrl("/")`의 호스트로 판단하므로 통과하지만 실제 Windows에서는 확인하지 못했다.
