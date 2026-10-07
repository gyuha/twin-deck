<!-- forge-slug: model-viewer-loaders-1of2 -->
<!-- task: 81 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# 3D 모델 로더 모듈: 13개 확장자를 three.js 객체로 읽고 Draco 디코더를 번들한다

## Goal / Non-goals
- Goal: `apps/desktop/src/lib/model/`에 확장자별 로더 선택 모듈을 만든다. 지원: glb, gltf(GLTFLoader + DRACOLoader, 디코더 파일은 `public/draco/`에 번들해 오프라인), obj, fbx, stl, 3mf, ply, usdz, gcode(three `GCodeLoader`), step/stp·iges/igs(`occt-import-js` WASM으로 메시를 만들어 three `BufferGeometry`로 변환). 입력은 `ArrayBuffer`와 파일 이름, 출력은 `THREE.Object3D`. 로더는 동적 `import()`로만 불러와 메인 번들에 안 들어가게 한다. 결과를 가운데로 옮기고 크기를 맞추는 `normalize`(바운딩박스·카메라 맞춤 값)도 포함한다. 확장자 판별 함수 `modelKindOf(name)`(대소문자 무시, 비지원이면 null)를 내보낸다.
- Non-goals: 화면 렌더링·컨트롤(2/2), Preview 연동, 애니메이션 재생, 단독 .drc·KTX2·Meshopt, 설정 키.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/model-formats.test.ts` 통과이고 `it(`이 13개 확장자 각각에 대해 있음(사전: 파일 없음 — 전진 검사). 각 소형 픽스처(`src/__tests__/fixtures/models/*`)가 파싱돼 `Box3`가 유한하고 비어있지 않다. 픽스처는 직접 만든 아주 작은 파일(큐브/삼각형 1~2개)이고 FBX는 손으로 쓴 텍스트 형식이다.
  2. Draco 압축 glTF/GLB 픽스처 테스트가 통과하고, 디코더는 `public/draco/`의 로컬 파일이며 `grep -rnE "gstatic|cdn\\.|unpkg" apps/desktop/src/lib/model` → 0줄 (부정 검사이므로 같은 명령으로 `grep -rn "draco" apps/desktop/src/lib/model | wc -l` ≥ 1 도 함께 확인: 명령이 실제로 도는 증거).
  3. `modelKindOf`가 대문자 확장자·경로·확장자 없는 이름·`.step`/`.stp`/`.iges`/`.igs`를 올바르게 처리하는 테스트가 통과.
  4. `cd apps/desktop && bunx tsc --noEmit` 통과. `bunx vitest run` 기존 기준선(알려진 3건 실패 외 없음).
  5. 모델 라이브러리가 지연 로드: `grep -rn "from \"three\|from 'three" apps/desktop/src --include=*.ts --include=*.tsx | grep -v "lib/model\|__tests__"` → 0줄 (정적 import는 lib/model 안에서만, 사용처는 동적 import).

## Work slices
- [ ] S1. 의존성 추가(`three`, `@types/three`, `occt-import-js`, Draco 디코더 파일을 `public/draco/`로 복사하는 스크립트나 커밋된 파일, 테스트 픽스처 생성용 devDependency) — completion criterion: `bun install` 후 `bunx tsc --noEmit` 통과, `ls apps/desktop/public/draco` 에 `draco_decoder.js`·`draco_decoder.wasm`·`draco_wasm_wrapper.js`
- [ ] S2. `lib/model/index.ts`: `modelKindOf`, 로더 선택·동적 import, `normalize`(depends: S1) — completion criterion: DoD 3, 5
- [ ] S3. 포맷별 로더 어댑터(OBJ/FBX/STL/3MF/PLY/USDZ/GCODE/GLTF+Draco/STEP·IGES) (depends: S2) — completion criterion: DoD 1, 2
- [ ] S4. 픽스처와 `model-formats.test.ts`, 회귀 확인 (depends: S3) — completion criterion: DoD 1, 4
