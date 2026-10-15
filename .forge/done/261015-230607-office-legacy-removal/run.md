# 실행 기록 — 옛 Office 미리보기(Quick Look·처리기·mammoth/SheetJS)를 지운다 (task #176)

## 슬라이스 결과
- S1 Rust 삭제(`quicklook.rs`·`preview_handler.rs`·`preview_host.rs`, 픽스처 `fixtures/quicklook/`, 명령 6개, `Service`의 `quicklook`, `main.rs`의 `mod`·`.manage`, `Cargo.toml`의 `windows` 의존) — ✅ 계획대로. `task gen-types`로 바인딩 갱신.
- S2 UI·브리지·설정 삭제(`QuickLookView`·`PreviewHandlerView`·`OfficeView`·`lib/office/`, `store.ts`·`backend.ts`·`tauri.ts`·`fake.ts`·`index.ts` 항목, `Preview.tsx` 옛 분기, 테스트 12개 파일, i18n 키, `preview.office` 설정) — ✅ 계획대로. 사용자 config 호환 테스트 추가.
- S3 의존성 정리(`bun remove mammoth xlsx jszip` + `dompurify`) — ⚠ 계획은 3개였으나 `dompurify`도 이 삭제로 쓰는 곳이 없어져 같이 뺐다(내가 만든 고아).
- S4 문서(ADR-0020, 0014·0015 Superseded, ADR 색인, README 한 쌍, docs 01·05·07·09, THIRD_PARTY_NOTICES, `.forge/CONTEXT.md`) — ✅ 계획대로.

## 계획과 달라진 점
- ⚠ **검사 정정**: 루프 검사 C3와 이 계획 DoD 1의 `git ls-files | grep -c …`가 봉인된 기록(`.forge/done/*office-quicklook-preview*`)과 옛 ADR 파일명(`0014-macos-office-quicklook-preview.md`)까지 세서 어떤 작업으로도 0이 될 수 없었다. 범위를 `apps crates packages`로 좁혔다(기준선 19 → 10). 목표(코드에서 옛 구현 제거)는 그대로다. `loop.md` C3에 이유를 적었다.
- ⚠ DoD 4의 `git grep -c -i 'quick ?look|미리보기 처리기|preview\.office' (README·docs, adr 제외) → 0`은 과했다(0이 아니라 2). 남은 2건은 Marta 조사 기록(`docs/01-feature-spec.md:164` "Quick Look 사용 여부", `docs/07-ui-spec.md:137` Marta가 Quick Look을 쓰는지 `[알 수 없음]`)으로 정당하다. 두 번째 줄에는 ADR-0020으로 바뀌었다는 설명을 덧붙였다.
- ⚠ `lib/hwp/index.ts`가 옛 `lib/office`에서 `MAX_BYTES`(20MB)를 가져다 쓰고 있어, 같은 값을 `lib/hwp` 안으로 옮겼다. `EpubView`가 `QuickLookView`의 `layout`을 쓰고 있어 그 함수를 `EpubView.tsx`로 옮겼다. `previewScroll.ts`의 `iframe:not([data-quicklook])`는 `iframe`으로 줄였다(동작 동일).
- ⚠ `i18n/rust.ts`에서 지운 Rust 코드가 쓰던 문구 20개를 뺐다(소스에 없는 항목 검사).
- ⚠ **확인하지 못한 것**: 지운 `windows` 크레이트 의존과 `cfg(windows)` 코드는 macOS에서 컴파일 확인만 됐고(앱 크레이트 `cargo build` 통과), Windows 빌드는 확인하지 못했다. 실제 앱(WKWebView·Windows) 눈 확인도 하지 못했다.

## DoD baseline → after
1. 옛 파일 수(`git ls-files apps crates packages | grep -c …`): 10 → 0 (앞방향)
2. `package.json`의 mammoth·xlsx·jszip: 3 → 0 (앞방향. dompurify도 제거)
3. `git grep -l 'preview\.office' (CHANGELOG·adr·.forge 제외)`: 12 → 0 (앞방향. 호환 테스트 주석 문구는 `[preview]` 아래 `office` 키로 바꿈). `cargo test -p td-config` 호환 테스트 통과.
4. `grep -l office_oxide …(5개 파일)`: 작성 시점 1(ADR 없음·README 없음) → 5 (앞방향). 나머지 문구 검사는 위 정정 참고.
5. 회귀: vitest 161 files / 1370 passed · tsc 0 · td-config 59+17 passed · twin-deck-desktop 141 passed · fmt ok · clippy(twin-deck-desktop, td-config) ok — 모두 작성 시점에도 통과하던 방어선
6. `cargo build -p twin-deck-desktop` 통과(경고 없음)
