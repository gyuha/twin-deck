# RUN — 폴더 미리보기 ASCII 트리

- S1 서비스 `dir_preview` + `preview_dir_*` 테스트 3개 — ✅ as planned
- S2 FakeBackend 트리 + `folder-preview.test.tsx` — ✅ as planned (기존 `preview.test`·`preview_dto_maps_kinds`의 "폴더=Directory/미리 볼 수 없음" 단언은 의도된 동작 변경이라 갱신)
- S3 문서 한 줄 + 회귀 확인 — ✅ as planned (`docs/01-feature-spec.md` VIEW-01)

DoD baseline → after
1. `cargo test -p twin-deck-desktop preview_dir`: 0개 → 3개 통과
2. `vitest folder-preview.test.tsx`: 없음 → 통과
3. 회귀: cargo workspace 전부 통과, vitest 702 통과·3 실패(audio-preview, preview-scroll PDF, theme — 기준선과 동일, 사전 통과가 정상)
4. tsc 통과, gen-types 후 generated 변경 없음, clippy 통과
5. `grep -rn "ASCII 트리" docs | wc -l`: 0 → 1

설계 메모: 폴더는 아카이브 미리보기처럼 `PreviewKind::Text`로 돌려줘서 UI(Preview.tsx)와 bindings 변경이 없다. 폴더 이름이 `.md`/`.json`이면 UI가 그 형식으로 렌더하는 한계가 있다.
