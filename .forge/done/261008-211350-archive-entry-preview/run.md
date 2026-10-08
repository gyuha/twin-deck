# run — 압축 파일 안의 파일 미리보기 (이슈 #37)

fg-run이 워크플로 없이 직접 실행했다(작업이 작아 워크플로 비용이 더 크다).

## 슬라이스별 결과
- S1 백엔드: `Service::preview`가 압축 안 경로를 `td_vfs::read_preview_vfs`(신규)로 읽어 글·이미지 내용을 돌려준다 — ✅ as planned (텍스트 해석은 `text_preview`로 뽑아 `read_preview`와 공유)
- S2 연결: 바인딩·`Backend`·`fake.ts` 변경 없음, `archive-entry-preview.test.tsx` 2건 추가 — ⚠ 계획은 "필요하면 고친다"였고 바뀐 곳이 없다(`FakeBackend`가 이미 `x.zip!/…` 항목을 읽고 `editBlockReason`이 이미 압축 안 편집을 막는다). 테스트는 처음부터 통과해서 UI 쪽은 앞으로 가는 확인이 아니라 회귀 방지다
- S3 문서: `docs/01-feature-spec.md` VIEW-01에 압축 안 파일 미리보기와 한계(영상·오디오·PDF·3D·Office 미지원, 보기 전용) — ✅ as planned

## DoD baseline → after
1. `preview_archive_entry` 테스트: 0건 → 1건 통과 (앞으로 가는 확인)
2. vitest "압축 안 파일 미리보기": 0건 → 2건 통과 (사전 상태에서 이미 통과할 수 있는 회귀 방지 성격, 위 S2 참고)
3. `td-vfs`·`td-archive`·`td-ops` 전부 통과 → 통과 / `twin-deck-desktop` 57건 통과 / vitest 1002 통과 · 1 실패(`pdf-preview`, 기준선) + 파일 1개 로드 실패(`model-formats`)
4. `up_to_date` 통과 → 통과(바인딩 변경 없음), clippy·tsc 통과 → 통과, `cargo fmt --check` 통과
5. `preview_archive` 4건·`preview_cbz` 3건·`preview_dto_maps_kinds` 1건 통과 → 같음

## 어긋난 점
- `model-formats.test.ts`는 `node_modules/occt-import-js/dist/occt-import-js.wasm`이 없어 파일째 실패한다. 변경을 stash한 깨끗한 트리에서도 같은 ENOENT라서 이 작업의 회귀가 아니다(기준선 소음 목록에는 없던 환경 문제).
- 영상·오디오·PDF·3D·Office의 압축 안 미리보기는 범위 밖이라 `Other`("미리 볼 수 없음")이다. 사용자에게 보이는 한계다.
- 실제 WKWebView 화면 확인은 하지 않았다(사람 몫).
