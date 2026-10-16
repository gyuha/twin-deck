<!-- forge-slug: preview-copy-image-backend -->
<!-- task: 188 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 이미지를 운영체제 클립보드로 복사하는 백엔드 기능 (이슈 #88 1/2)

## 목표 / 비목표
- 목표: 경로의 이미지 파일을 읽어 운영체제 클립보드에 **이미지로** 넣는 Tauri 명령과 `Backend.copyImage(path)`를 만든다. 테스트에서는 실제 클립보드 대신 가짜를 주입한다(기존 `FileClipboard` 방식).
- 비목표: 미리보기 화면의 버튼·`Mod+C`(2/2, `preview-copy-image-ui`), 설정 키, SVG 래스터화, 이미지가 아닌 종류, 실제 OS 클립보드를 쓰는 자동 테스트(사용자의 클립보드를 덮어쓰므로 하지 않는다).

## 근거(코드로 확인한 사실)
- `service.rs:708-713` `trait FileClipboard`, `:716` `SystemFileClipboard`(`clipboard_rs::ClipboardContext`), `:1248-1253` `with_file_clipboard`(테스트용 주입). 이미지 클립보드도 같은 모양으로 만든다.
- `clipboard-rs = "0.3.5"`는 기본 기능 `image`가 켜져 있어 `RustImageData::from_bytes`·`set_image`를 쓸 수 있다(`apps/desktop/src-tauri/Cargo.toml:39`).
- 미리보기는 `td_vfs::read_preview_vfs`로 이미지 바이트를 읽어 데이터 URL로 만든다(`service.rs`·`td-vfs/src/preview.rs`). 아카이브 안 이미지도 미리보기에 보이므로 같은 읽기 경로를 쓰면 복사도 된다.
- 새 Tauri 명령은 Rust 명령 → `task gen-types`(bindings) → `backend.ts` → `tauri.ts` → `fake.ts` 순서로 건드린다(AGENTS.md). `up_to_date` 테스트가 생성 파일이 낡으면 실패한다.
- 알려진 함정(이전 회고): Rust에 사용자에게 보이는 한국어 오류 문구를 더하면 `apps/desktop/src/i18n/rust.ts` 대응표 테스트(`i18n-rust-messages.test.ts`)가 전체 vitest에서 실패한다. 영어 번역을 함께 넣는다.

## 원천(Source of truth)
- 용어: 없음
- 관련 ADR: 없음
- 관련 이슈: #88 (1/2 — 백엔드. 화면은 2/2)
- 완료 정의(DoD): `.forge/loop.md`의 C1·C2·C4. 구체적으로:
  1. 서비스 테스트 `copy_image_*`가 있고 **수정 전 코드에서 빨강(컴파일 실패 또는 실패)임을 먼저 실행해 `run.md`에 남기며**, 수정 후 초록이다(red → green): (a) PNG 고정 파일을 복사하면 가짜 클립보드가 받은 이미지의 너비·높이가 원본과 같다. (b) JPEG도 같다. (c) 이미지가 아닌 파일(텍스트)·깨진 PNG·없는 경로는 오류를 돌려주고 **가짜 클립보드는 호출되지 않았다**. (d) SVG는 복사할 수 없다는 명확한 오류다(조용히 빈 이미지를 넣지 않는다). (e) 아카이브 안 이미지는 복사되거나 명확한 오류다 — 어느 쪽인지 `run.md`에 적는다.
  2. `cargo test -p twin-deck-desktop up_to_date` 통과(`task gen-types` 실행 후).
  3. `cargo test --workspace`, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`, `bun run test`, `cd apps/desktop && bunx tsc --noEmit` 통과.
  4. `FakeBackend`가 `copyImage(path)`를 구현하고(복사된 경로를 `copiedImages`에 기록, 테스트에서 실패를 주입할 수 있는 필드) 기존 `ts-client` 테스트가 통과한다.

## 작업 조각(Work slices)
- [ ] S1. 서비스 테스트 `copy_image_*`를 먼저 쓰고 현재 코드에서 **실패함을 실행해 확인**한다(가짜 클립보드 트레이트·메서드가 아직 없어 컴파일 실패라면 그 사실과, 최소한의 빈 껍데기로 컴파일한 뒤의 단언 실패를 `run.md`에 기록한다). 테스트용 PNG·JPEG는 `image` 크레이트를 dev-dependency로 써서 만들거나 작은 바이트 상수로 둔다. — 완료 기준: 단언이 수정 전에 실패한다.
- [ ] S2. `trait ImageClipboard`(이미지 하나를 받는다)와 `SystemImageClipboard`, `Service`의 필드와 테스트용 `with_image_clipboard`, 메서드 `copy_image_to_clipboard(path)`를 만든다. 바이트를 읽어(미리보기와 같은 읽기 경로) `RustImageData::from_bytes`로 디코딩하고, 실패하면 클립보드를 건드리지 않고 오류를 돌려준다. — 완료 기준: S1의 (a)~(e)가 초록. (depends: S1)
- [ ] S3. Tauri 명령 `copy_image_to_clipboard`를 `commands.rs`에 만들고 등록한다. `task gen-types`로 `bindings.ts`를 갱신한다. `Backend.copyImage(path)`를 `backend.ts`·`tauri.ts`·`fake.ts`에 더한다(`fake.ts`: 존재하는 파일만 성공, `copiedImages`, 실패 주입 필드 `copyImageError`). — 완료 기준: `up_to_date` 초록, `ts-client` 테스트 초록. (depends: S2)
- [ ] S4. 새로 생긴 한국어 Rust 오류 문구가 있으면 `apps/desktop/src/i18n/rust.ts` 대응표에 영어를 더한다. — 완료 기준: `bun run test` 전체 초록(특히 `i18n-rust-messages.test.ts`). (depends: S3)
