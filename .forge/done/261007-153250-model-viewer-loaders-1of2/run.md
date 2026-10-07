# RUN — 3D 모델 로더 모듈

- S1 의존성(three 0.186.1, occt-import-js 0.0.23, 개발용 @types/three·draco3d) + `public/draco/` 디코더 3파일 복사 — ✅ as planned
- S2 `lib/model/kinds.ts`(three 없이 `modelKindOf`)·`index.ts`(`loadModel`, `normalize`) — ✅ as planned
- S3 형식별 로더: STL·PLY·OBJ·FBX·3MF·USD(USDZ)·GCODE·GLTF(+Draco)·STEP/IGES(occt) — ⚠ USDZLoader는 three에서 deprecated라 `USDLoader`를 썼다. occt는 같은 페이지에서 두 번 초기화하면 오류라 인스턴스를 캐시한다. glTF는 외부 파일용 `resolve` 훅을 열어 둠(2/2에서 사용)
- S4 픽스처 13종+Draco, `model-formats.test.ts` 18개 — ⚠ IGES 손 작성 픽스처가 처음엔 안 읽혀 Global 섹션 문자열 길이(`nH`)를 고쳤다. jsdom에서는 `ArrayBuffer instanceof`가 어긋나 테스트에서 `Uint8Array.from(b).buffer`로 바꿨다(브라우저 fetch는 해당 없음)

DoD baseline → after
1. `model-formats.test.ts`: 없음 → 18 passed (13 확장자 + modelKindOf + Draco 2)
2. 외부 주소 grep 0줄, `draco` grep 4줄(명령이 도는 증거)
3. modelKindOf 케이스 통과
4. tsc 통과, vitest 790 통과·3 실패(기준선 audio-preview·preview-scroll PDF·theme)
5. 정적 three import는 lib/model 밖 0줄

한계: Draco는 브라우저 `DRACOLoader`(웹 워커)가 아니라 노드용 draco3d 디코더로 풀리는지 검증했다. 브라우저 워커 경로와 실제 화면 렌더링은 자동 검증하지 못했다.
