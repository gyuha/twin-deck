# 실행 기록 — office_oxide로 Office 문서 미리보기를 새로 만든다 (task #175)

## 슬라이스 결과
- S1 `office.rs`(office_oxide → Markdown, 20MB·512KB 한도, 확장자·압축 안 거절) + `Cargo.toml` — ✅ 계획대로
- S2 `service.rs`·`commands.rs`·`task gen-types`·`backend.ts`·`tauri.ts`·`fake.ts`·`store.ts` — ✅ 계획대로 (`index.ts`에 `OfficePreviewDto` 내보내기 추가)
- S3 `OfficeMarkdownView.tsx` + `Preview.tsx` 연결 — ✅ 계획대로. 기존 i18n 키(`office.note`·`office.aria`·`office.truncated`)를 재사용해 새 문구는 없다. Rust 오류 문구 4개는 `i18n/rust.ts`에 영어 대응을 넣었다.

## 계획과 달라진 점
- ⚠ 옛 경로를 검증하던 테스트 4개(`office-stale-size`·`preview-handler`·`quicklook-preview`·`quicklook-sheets`)를 이 작업에서 지웠다. 새 경로가 모든 Office 확장자를 먼저 가져가 이 테스트들의 전제(Quick Look·처리기로 감)가 무효가 됐고, 어차피 2/2에서 지울 파일이다. 옛 `office-preview.test.tsx`는 새 경로 기준으로 다시 썼다.
- ⚠ Rust 픽스처는 docx·pptx를 파일로 두지 않고 테스트에서 최소 OOXML ZIP으로 만든다(`td_archive::ZipEdit`). xlsx만 `fixtures/office/two-sheets.xlsx`를 쓴다(옛 `fixtures/quicklook/`은 2/2에서 지워지므로 복사했다). 구형 doc·xls·ppt는 이진 형식이라 픽스처를 만들지 못해 **테스트하지 못했다** — 확장자는 받아들이고 office_oxide가 처리하지만 동작은 검증하지 않았다.
- ⚠ 실제 앱(WKWebView) 눈 확인은 하지 않았다.

## DoD baseline → after
1. `cargo test -p twin-deck-desktop office` — 함수 없음(실패) → 2 passed (앞방향)
2. `vitest office-preview.test.tsx` — 옛 단언 → 7 passed (앞방향)
3. `tsc --noEmit` 0 → 0 · vitest 전체 163 files / 1382 passed · `cargo test -p twin-deck-desktop` 162 passed(`coalesce_*`는 병렬 실행에서 한 번 실패, 단독 재실행 통과 — 알려진 소음) · fmt ok · clippy ok — 모두 회귀 방어선
4. `git grep -c officePreview packages/ts-client/src` — backend 1 · tauri 2 · fake 2 · bindings 1, 네 파일 모두 ≥1 (작성 시점 0)
