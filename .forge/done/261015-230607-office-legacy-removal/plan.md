<!-- forge-slug: office-legacy-removal -->
<!-- task: 176 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# 옛 Office 미리보기(Quick Look·처리기·mammoth/SheetJS)를 지운다 (이슈 #78)

## 목표 / 하지 않을 것
- 목표: 1/2(`office-oxide-preview`)가 모든 Office 확장자를 가져간 뒤, 쓰이지 않는 옛 구현과 그 의존성·설정·테스트·문서를 지우고, 결정을 ADR로 남긴다.
- 하지 않을 것:
  - 새 경로(1/2)의 동작 변경. HWP·EPUB·PDF·다른 미리보기 변경.
  - 버전 올리기, `CHANGELOG.md` 작성, 배포·push. (사용자에게 보이는 변화 — macOS Quick Look·Windows 처리기로 보이던 실제 문서 모습이 사라지고 텍스트·표로 바뀜, `preview.office` 설정 삭제 — 는 배포 때 CHANGELOG `### 변경`에 쓸 것으로 완료 보고에 적는다.)
  - 이미 공개된 릴리스·`.forge/done`·`.forge/executed`의 옛 기록 수정. 옛 ADR 본문은 상태만 바꾼다.

## 기준 문서
- 용어집: `.forge/CONTEXT.md`의 "데이터 미리보기"(1/2에서 고친 의미 확인), "Quick Look 미리보기"(삭제)
- 관련 ADR: docs/adr/0014-macos-office-quicklook-preview.md, 0015-windows-office-preview-handler.md → "상태: Superseded by ADR-0020"으로. 새 ADR `docs/adr/0020-office-preview-via-office-oxide.md`(문서 모습 충실도를 포기하고 3개 OS 동일·구형 포맷·번들 단순화를 택한 결정, 검토한 대안 포함)와 `docs/adr/README.md` 색인 한 줄.
- 완료 정의(DoD):
  1. `git ls-files apps crates packages | grep -c -E 'quicklook|preview_handler|preview_host|QuickLookView|PreviewHandlerView|OfficeView|lib/office'` → 0 (작성 시점 10(정정 후 실측; 처음 19는 봉인 기록·ADR 파일명까지 센 범위 오류), 앞방향. 1/2가 새 파일 이름에 이 문자열을 쓰지 않았는지도 이 검사가 잡는다 — 겹치면 1/2 파일명을 고친다).
  2. `grep -c -E '"(mammoth|xlsx|jszip)"' apps/desktop/package.json` → 0 (작성 시점 3). `bun install`로 `bun.lock`을 맞춘다. jszip을 다른 곳이 쓰지 않는지 `git grep -n jszip -- ':!bun.lock' ':!.forge'`로 먼저 확인한다(작성 시점에는 Office 코드·테스트만 쓴다).
  3. `git grep -l 'preview\.office' -- ':!CHANGELOG.md' ':!docs/adr' ':!.forge' | wc -l` → 0 (작성 시점 12). `td-config`의 `office` 필드·`default.toml`·테스트·`Settings.tsx` 항목·i18n을 지우고 `task gen-types`를 돌린다. 이미 `[preview] office = …`가 적힌 사용자 `config.toml`이 오류 없이 읽히는지를 `cargo test -p td-config`의 새 테스트(미지의 키가 무시되거나 경고만)로 증명한다.
  4. 문서: `grep -l 'office_oxide' README.md README.en.md docs/01-feature-spec.md THIRD_PARTY_NOTICES.md docs/adr/0020-office-preview-via-office-oxide.md | wc -l` → 5, `docs/06-config-plugins.md`·`docs/07-ui-spec.md`에서 Quick Look·미리보기 처리기·`preview.office` 언급이 새 설명으로 바뀐다(`git grep -n -i -E 'quick ?look|미리보기 처리기|preview\.office' -- README.md README.en.md docs ':!docs/adr'` → 0). THIRD_PARTY_NOTICES에서 mammoth·xlsx·jszip 행이 빠지고 office_oxide 행이 들어간다. README.md와 README.en.md는 같은 커밋에서 맞춘다.
  5. 회귀 방어선(작성 시점에도 통과): `cd apps/desktop && bunx vitest run` 전체, `bunx tsc --noEmit`, `cargo test -p td-config`, `cargo test -p twin-deck-desktop`(`up_to_date`·`coalesce_*`는 단독 재실행 통과면 인정), `cargo fmt --check`, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cargo clippy -p td-config -- -D warnings`. 지운 뒤 설정 화면 탭 목록 테스트(`settings.test.tsx`)·F키 바인딩 테스트가 깨지지 않는다.
  6. Windows 전용 코드(`cfg(windows)`)를 지운 뒤에도 앱 크레이트가 macOS에서 컴파일된다. 지운 모듈을 `main.rs`·`Cargo.toml`(예: `windows` 크레이트 기능 플래그)에서 더 이상 참조하지 않는다. Cargo.toml에서 이제 쓰이지 않는 의존성·기능은 정리하되, 다른 코드가 쓰는 것은 건드리지 않는다(`cargo build -p twin-deck-desktop` 통과가 증거).

## 작업 쪼개기
- [ ] S1. Rust 쪽 삭제: `quicklook.rs`, `preview_handler.rs`, `preview_host.rs`, `fixtures/quicklook/`, `main.rs`의 `mod`·`.manage(...)`, `commands.rs`·`service.rs`의 관련 명령·필드·테스트·`QuickLook` 구조, `Cargo.toml`에서 이 코드만 쓰던 의존성. `task gen-types`. — 완료 기준: DoD 1(Rust 부분), 6
- [ ] S2. UI·브리지·설정 삭제: `QuickLookView`·`PreviewHandlerView`·`OfficeView`·`lib/office/`, `store.ts`·`backend.ts`·`tauri.ts`·`fake.ts`의 관련 항목, `Preview.tsx` 옛 분기와 `handlerFailed` 같은 잔재, 관련 테스트(office-formats·office-sanitize·office-stale-size·quicklook-*·preview-handler, `office-fixtures.ts` 중 새 테스트가 안 쓰는 것), i18n 문구, `preview.office` 설정(config·default.toml·Settings·테스트·`task gen-types`). 사용자 config 호환 테스트 추가. — 완료 기준: DoD 1, 3, 5 (depends: S1)
- [ ] S3. 의존성 정리: `bun remove mammoth xlsx jszip`(SheetJS는 CDN 타르볼 항목), `bun.lock` 갱신. — 완료 기준: DoD 2 (depends: S2)
- [ ] S4. 문서: ADR-0020 작성, 0014·0015 상태 변경, ADR 색인, README 한 쌍, `docs/01`·`06`·`07`, `THIRD_PARTY_NOTICES.md`, `.forge/CONTEXT.md` 용어집(Quick Look 항목 삭제, 데이터 미리보기 의미 갱신), `docs/05`의 영향 확인(키 변경 없음). — 완료 기준: DoD 4 (depends: S3)
