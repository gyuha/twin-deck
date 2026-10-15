<!-- forge-slug: office-oxide-preview -->
<!-- task: 175 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# office_oxide로 Office 문서 미리보기를 새로 만든다 (이슈 #78)

## 목표 / 하지 않을 것
- 목표: Rust 쪽에서 `office_oxide`(MIT OR Apache-2.0, 순수 Rust)로 docx·xlsx·pptx·doc·xls·ppt(+docm·xlsm·pptm)를 읽어 Markdown으로 바꾸고, 미리보기에서 기존 `MarkdownView`로 그린다. 3개 OS에서 같게 동작하고 설정 없이 늘 켠다. 옛 경로(Quick Look·처리기·mammoth/SheetJS)는 이 계획에서 지우지 않고, 새 경로가 모든 Office 확장자를 먼저 가져가게만 한다(삭제는 2/2).
- 하지 않을 것:
  - 옛 코드·의존성·설정 키 삭제(2/2에서 한다).
  - 문서 모습(서식·페이지·도형) 재현. `office_oxide`는 텍스트·표 추출이라 충실도가 데이터 수준임을 문서에 숨기지 않는다.
  - 편집·저장, 압축 안(`x.zip!/…`) 파일 읽기(EPUB·HWP처럼 "미리 볼 수 없는 형식"), 새 키 바인딩.
  - 버전 올리기, `CHANGELOG.md`, 배포.

## 기준 문서
- 용어집: `.forge/CONTEXT.md` "데이터 미리보기"(이번에 새 의미로 고친다)
- 관련 ADR: docs/adr/0014, 0015(2/2에서 Superseded 처리), 새 ADR은 2/2에서 쓴다. 조사 결과: office_oxide 0.1.15는 텍스트·Markdown·IR 추출 라이브러리이며 렌더러가 아니다. 이 환경(rustc 1.93)에서 `cargo build`가 통과했고 `two-sheets.xlsx`는 시트 제목(`## 첫시트`)과 GFM 표로 나온다.
- 완료 정의(DoD):
  1. `cargo test -p twin-deck-desktop office`가 통과한다. 테스트는 docx·xlsx·pptx 픽스처(`apps/desktop/src-tauri/fixtures/office/`, 가능하면 doc·xls·ppt도)를 `Service`의 Office 미리보기에 넣어 알려진 문장·셀 값이 Markdown에 들어 있음을, 깨진 파일과 크기 한도(예: 20MB) 초과가 오류임을, 압축 안 경로가 거절됨을 단언한다. 작성 시점: 함수가 없어 실패(앞방향).
  2. `cd apps/desktop && bunx vitest run src/__tests__/office-preview.test.tsx`가 통과한다(기존 파일을 새 경로 기준으로 다시 쓴다). 모든 Office 확장자가 새 뷰로 가고, 문서 글자가 보이고, 오류·압축 안 경로를 안내 문구로 보인다. 작성 시점: 기존 테스트가 옛 경로를 단언해 새 단언은 실패(앞방향).
  3. `cd apps/desktop && bunx tsc --noEmit` → 종료 코드 0, `cd apps/desktop && bunx vitest run` 전체 통과, `cargo test -p twin-deck-desktop`(생성 파일 `up_to_date` 포함) 통과, `cargo fmt --check`, `cargo clippy -p twin-deck-desktop -- -D warnings`. 회귀 방어선이라 작성 시점에도 통과한다.
  4. 새 Tauri 명령은 Rust 명령 → `task gen-types` → `backend.ts` → `tauri.ts` → `fake.ts` 체인을 모두 거친다. `git grep -c 'officePreview' packages/ts-client/src` 가 네 파일(`backend.ts`·`tauri.ts`·`fake.ts`·`generated/bindings.ts`) 모두 1 이상이다(작성 시점 0).

## 작업 쪼개기
- [ ] S1. `office_oxide = "0.1"`을 `apps/desktop/src-tauri/Cargo.toml`에 넣고(`THIRD_PARTY_NOTICES.md`는 2/2에서 정리), 새 모듈(예: `office_preview.rs`)에 `Document::open` → `to_markdown`을 감싼 함수를 만든다. 크기 한도·확장자 판별·압축 안 거절·긴 결과 자르기(자른 사실을 결과에 표시)를 넣는다. 읽기는 한 번에 하나가 메인 스레드를 막지 않게 `spawn_blocking`급으로 돌린다. 시간이 오래 걸릴 수 있는 큰 xlsx를 고려한다. — 완료 기준: DoD 1
- [ ] S2. `service.rs`에 `office_preview(path)`를, `commands.rs`에 `#[tauri::command] #[specta::specta]` 래퍼를 추가해 명령 목록에 등록하고 `task gen-types`로 바인딩을 갱신한다. 결과 DTO는 `{ markdown: string, truncated: boolean, format: string }` 정도로 최소화한다. `backend.ts`·`tauri.ts`·`fake.ts`(FakeBackend는 응답 주입 가능)를 맞춘다. 반드시 `bridge-wiring-author` 에이전트 지침의 체인을 따른다. — 완료 기준: DoD 4, DoD 3의 `up_to_date` (depends: S1)
- [ ] S3. 새 뷰 `ui/OfficeMarkdownView.tsx`(이름은 자유)를 만들어 `MarkdownView`로 그린다. loading/error/ready, 잘렸으면 안내 줄, "문서 모습이 아니라 텍스트·표만 보인다"는 안내를 한글 i18n으로 넣는다(ko·en 둘 다). 문서 속 링크가 앱을 이동시키지 않는지 `MarkdownView`의 기존 처리를 확인한다. `Preview.tsx`는 모든 Office 확장자(docx·xlsx·pptx·doc·xls·ppt·docm·xlsm·pptm)·디스크 파일에서 이 뷰를 쓰고, 옛 분기(Quick Look·처리기·`OfficeView`)는 타지 않게 만든다(코드는 남긴다). 확장자 판별은 새 작은 함수로 두되 `lib/office/` 경로와 `OfficeView`·`quicklook`·`preview_handler`·`preview_host` 이름은 쓰지 않는다(2/2의 삭제 검사와 겹친다). — 완료 기준: DoD 2, DoD 3 (depends: S2)
