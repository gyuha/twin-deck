<!-- forge-slug: model-viewer-preview-2of2 -->
<!-- task: 82 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# 미리보기에서 3D 모델을 확장자로 골라 three.js로 렌더링한다

## Goal / Non-goals
- Goal: 1/2의 로더를 쓰는 `ModelView` 컴포넌트를 만들고 `Preview.tsx`가 확장자(`modelKindOf`)로 3D 뷰어를 고르게 한다(서비스가 돌려주는 kind와 무관). 파일 바이트는 `backend.fileUrl(path)`를 `fetch`해 `ArrayBuffer`로 읽는다. three `WebGLRenderer` + `OrbitControls`(회전·확대·이동), 조명과 재질이 없는 메시용 기본 재질, 창 크기 변경 대응, 닫을 때 렌더러·지오메트리 해제(`dispose`). 불러오는 중·실패·WebGL 불가 시 문구를 보여 준다(WebGL 불가: "3D 미리보기를 쓸 수 없습니다"). 문서 한 줄(`docs/01-feature-spec.md` VIEW-01)과 `tauri.conf.json`의 자원/CSP 확인(wasm 로드 가능해야 함).
- Non-goals: 애니메이션 재생 UI, 와이어프레임·단면 등 옵션, 미리보기 창 크기·동작 변경, Rust 변경, 설정 키.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/model-preview.test.tsx` 통과, `it(` 3개 이상(사전: 파일 없음 — 전진 검사): (a) `.stl` 같은 3D 확장자(대소문자 무시) 파일의 미리보기에서 3D 뷰어가 선택된다(예: 컨테이너 `aria-label="3D 모델 미리보기"`), (b) 일반 텍스트(`notes.txt`)는 기존 텍스트 뷰어 그대로, (c) jsdom처럼 WebGL이 없으면 "3D 미리보기를 쓸 수 없습니다"가 보인다.
  2. `cd apps/desktop && bun run build` 통과하고 `ls apps/desktop/dist/assets`에 `.wasm`과 three/occt용 별도 지연 로드 js 청크가 있다(사전 빌드에는 없음). 메인 `index-*.js`가 직전 대비 1MB 넘게 늘지 않는다(빌드 전후 크기를 run.md에 기록).
  3. `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run`이 기준선(알려진 3건 실패 외 없음)과 같다. `cargo test --workspace` 통과(회귀 방지 항목이라 사전 통과가 정상).
  4. `grep -rn "3D" docs/01-feature-spec.md | wc -l` ≥ 1 (사전: 0 — 전진 검사).
  5. 정리 코드 확인: `ModelView`의 `useEffect` cleanup이 `renderer.dispose()`를 부르는 것을 테스트(모듈 모킹)로 확인.

## Work slices
- [ ] S1. `ui/ModelView.tsx`(fetch → 로더 → three 렌더링·컨트롤·cleanup·상태 문구) — completion criterion: DoD 5
- [ ] S2. `Preview.tsx`가 `modelKindOf`로 뷰어를 고르는 분기 (depends: S1) — completion criterion: DoD 1
- [ ] S3. `model-preview.test.tsx`(three를 모킹해 jsdom에서 돌게) (depends: S2) — completion criterion: DoD 1, 5
- [ ] S4. 빌드·번들 분리 확인, 문서 한 줄, 회귀 확인 (depends: S3) — completion criterion: DoD 2, 3, 4
