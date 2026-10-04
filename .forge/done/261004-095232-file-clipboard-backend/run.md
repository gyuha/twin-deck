# RUN — OS 파일 클립보드 읽기/쓰기 백엔드 (file-clipboard-backend)

워크플로 없이 직접 실행했다(작은 작업).

- S1 `clipboard-rs` 의존성, `FileClipboard` trait과 `SystemFileClipboard`, `Service::set_clipboard_files`/`clipboard_files`(없는 경로는 거름), Tauri 명령 2개, 테스트 3개 — ✅ 계획대로
- S2 바인딩 재생성, `Backend` 인터페이스·Tauri 어댑터·`FakeBackend`(메모리 `fileClipboard`) — ✅ 계획대로
- S3 macOS 실제 클립보드 왕복 확인(임시 테스트, 확인 뒤 되돌림) — ✅ 계획대로

## DoD baseline → after
- `cargo test -p twin-deck-desktop clipboard`: 0개 → 3개 통과
- 실제 클립보드: `set_files([한글 a.txt, b.txt])` → `osascript`가 `«class furl»`로 읽음(`…/한글 a.txt`), `osascript`로 쓴 파일 → `get_files` = `[…/b.txt]`, 빈 목록 → 비워짐
- `up_to_date` 통과, bindings에 두 명령 있음, `tsc` 오류 없음
- `cargo test --workspace`·fmt·`clippy -p twin-deck-desktop -- -D warnings` 통과, vitest 504 통과·실패 1(기존 `pdf-preview`), ts-client 47·actions 19 통과

## 어긋난 점
- `with_file_clipboard`는 테스트에서만 써서 `#[cfg(test)]`로 한정했다(clippy 죽은 코드 경고).
- `cargo clippy --all-targets`는 기존 테스트 코드(`service.rs`의 `root.clone()`, 이번 변경과 무관)에서 실패한다. 완료 조건은 `--all-targets` 없는 clippy라 통과.
- 실제 클립보드 확인 때 사용자의 클립보드 내용을 덮어썼다.
- macOS는 임시 폴더를 `/private/var/...`로 보고하지만 `get_files`는 `/var/...`를 돌려줬다(같은 위치).
