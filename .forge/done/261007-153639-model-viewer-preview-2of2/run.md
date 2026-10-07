# RUN — 미리보기 3D 모델 뷰어

- S1 `ui/ModelView.tsx`(WebGL 확인 → 동적 import → fetch(`backend.fileUrl`) → loadModel/normalize → OrbitControls, ResizeObserver, cleanup에서 geometry/material/renderer dispose) — ✅ as planned
- S2 `Preview.tsx`가 `modelKindOf`로 3D 뷰어를 고르는 분기 — ⚠ 폴더는 이제 Text 종류의 트리라서 `.stl` 같은 이름의 폴더가 3D 뷰어로 열릴 수 있어, `PreviewState.isDir`를 추가해 폴더를 제외했다
- S3 `model-preview.test.tsx` 4개 + `model-view-dispose.test.tsx` 1개(렌더러만 가짜, 로더·장면은 진짜 three) — ✅
- S4 빌드·번들·문서·회귀 — ✅

DoD baseline → after
1. model-preview.test: 없음 → 4 passed (3D 선택·일반 파일·폴더 제외·WebGL 없음 문구)
2. `bun run build` 통과. 메인 `index-*.js` 1,521.30 kB → 1,525.90 kB(+4.6 kB). three(747 kB)·각 Loader·OrbitControls·occt(59 kB js + 7.6 MB wasm)가 별도 청크, `dist/draco/`에 디코더 3파일
3. tsc 통과, vitest 795 통과·3 실패(기준선), cargo test --workspace 통과
4. `grep -c "3D 모델" docs/01-feature-spec.md`: 0 → 1
5. dispose 테스트 통과(닫으면 `renderer.dispose` 호출)

한계(자동 검증 불가): jsdom에는 WebGL이 없어 실제 렌더링 화면, Tauri 자산 프로토콜 `fetch`의 CORS, 브라우저 `DRACOLoader` 워커 경로는 확인하지 못했다. `task dev`로 직접 확인이 필요하다. 외부 파일을 참조하는 .gltf(.bin·텍스처)는 `resolve` 훅으로 같은 폴더에서 읽게 해 두었지만 실제로 시험하지 않았다.
