<!-- forge-slug: preview-copy-image-backend -->
# 실행 기록 — 이미지를 운영체제 클립보드로 복사하는 백엔드 기능 (이슈 #88, 1/2)

## 조각별 결과
- S1 서비스 테스트 `copy_image_*` 먼저, 수정 전 빨강 확인 — ✅ as planned (컴파일 빨강 → 빈 구현으로 단언 빨강)
- S2 `ImageClipboard` 트레이트·`SystemImageClipboard`·`with_image_clipboard`·`copy_image_to_clipboard` — ⚠ 계획 + 보강: SVG는 이름으로 먼저 거부(디코더가 읽지 못하는 것과 구분되는 명확한 오류), 256 MiB 상한(`COPY_IMAGE_MAX_BYTES`)
- S3 Tauri 명령 `copy_image_to_clipboard` 등록, `task gen-types`(바인딩 갱신), `Backend.copyImage`·`tauri.ts`·`fake.ts`(`copiedImages`, `copyImageError`) — ✅ as planned
- S4 새 한국어 Rust 오류 3개의 영어 번역을 `rust.ts`에 — ✅ as planned (이번에는 전체 vitest 전에 먼저 넣어 실패를 피함)

## 수정 전 빨강 증거 (S1)
- 1단계(컴파일): `error[E0405]: cannot find trait ImageClipboard in this scope` — 테스트가 요구하는 트레이트·메서드가 없음.
- 2단계(단언): `ImageClipboard`·`copy_image_to_clipboard`를 `Err("미구현")` 빈 구현으로만 두고 실행: `cargo test -p twin-deck-desktop copy_image` → `2 passed; 3 failed`. 실패 3개(PNG·JPEG·압축 파일 안 PNG)는 모두 `unwrap()`이 `Err("미구현")`에서 패닉(의도한 이유). 통과 2개(이미지가 아닌 파일 거부, SVG 거부)는 빈 구현이 항상 오류를 돌려줘서 통과하는 것이라 **구현 후에도 클립보드가 비어 있는지**를 지키는 회귀 방지용이다.
- 중간에 테스트 가짜의 `image.get_size()`가 컴파일되지 않았다. `RustImageData::get_size`는 `clipboard_rs::common::RustImage` 트레이트 메서드라서 `use`를 추가했다(테스트 설계 문제였고 기대값은 그대로).

## DoD 기준값 → 실행 후
1. `copy_image_*` 5개 → 수정 전 컴파일 실패 / 빈 구현에서 3 실패 → 수정 후 5개 초록. (a) PNG 3×2 → 가짜 클립보드가 `(3, 2)`를 받음. (b) JPEG 16×8(`한글 사진.jpg` 이름) → `(16, 8)`. (c) 텍스트를 PNG 이름으로 둔 파일·절반으로 잘린 PNG·없는 경로 → 모두 오류이고 클립보드 기록은 비어 있음. (d) SVG → 오류, 클립보드 비어 있음. (e) **압축 파일 안 이미지는 복사된다**: `pack.zip!/inner.png` → `(3, 2)`(미리보기와 같은 `fs` 읽기 경로 `stat` + `read_head`).
2. `cargo test -p twin-deck-desktop up_to_date` → `UPDATE_BINDINGS=1`로 갱신 후 2개 통과(`bindings.ts`에 `copyImageToClipboard` 11줄 추가).
3. `cargo test --workspace` → 562 통과·실패 0 · `cargo clippy -p twin-deck-desktop -- -D warnings` 경고 없음 · `cargo fmt --check` 통과 · `bun run test` 전체 통과(desktop 168 파일 통과·1 건너뜀, 1433) · `bunx tsc --noEmit` exit 0.
4. `FakeBackend.copyImage`·`copiedImages`·`copyImageError` 구현, `ts-client` 테스트 89개 통과.

## 결정과 발견
- 테스트 이미지는 `image` 크레이트를 새 의존성으로 들이지 않고 작은 고정 바이트(PNG 85바이트, JPEG 883바이트, base64)로 두었다. 크기는 `sips`로 3×2·16×8임을 확인했다.
- 실제 OS 클립보드에는 쓰지 않았다(사용자의 클립보드를 덮어쓰기 때문). `SystemImageClipboard`는 `clipboard_rs::ClipboardContext::set_image`를 호출하는 두 줄뿐이고 자동 시험이 없다.
- **검증하지 못한 것**: 실제 macOS(NSPasteboard)·Windows 클립보드에 이미지가 들어가는지, 다른 앱(미리보기 앱·메신저)에 붙여 넣으면 보이는지. 사람이 확인해야 한다.
