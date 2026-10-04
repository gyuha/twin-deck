<!-- forge-slug: file-clipboard-backend -->
<!-- task: 46 -->
<!-- part: 1/2 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# OS 파일 클립보드 읽기/쓰기 백엔드

## Goal / Non-goals
- Goal: 파일 경로 목록을 OS 파일 클립보드에 쓰고(Finder/탐색기에 붙여 넣을 수 있는 형태) 읽는 백엔드를 만든다. Rust에서 파일 클립보드를 trait(`FileClipboard`)으로 분리해 테스트에서는 가짜 구현을 쓰고, 실제 구현은 파일 클립보드 크레이트(예: `clipboard-rs`)로 한다. Tauri 명령 두 개(쓰기/읽기)와 TS 바인딩, `Backend` 인터페이스(`setClipboardFiles`, `getClipboardFiles`)와 `FakeBackend`(메모리 클립보드)를 추가한다.
- Non-goals: 키 바인딩·화면 동작(다음 part), Windows 정밀 처리, 이미지·텍스트 클립보드.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `cargo test -p twin-deck-desktop clipboard`가 3개 이상 통과(순서·한글 이름 유지, 없는 경로 걸러짐, 빈 목록). macOS 실제 클립보드로 쓰기→`osascript`로 읽기, `osascript`로 쓰기→`get_files` 읽기가 모두 맞다(임시 확인). `up_to_date`·`tsc`·`cargo test --workspace`·fmt·clippy 통과.

## Work slices
- [ ] S1. 의존성 추가와 `FileClipboard` trait + 실제 구현 + 서비스 메서드 + Tauri 명령 + capabilities — completion criterion: `cargo test -p twin-deck-desktop clipboard` 통과
- [ ] S2. `task gen-types`로 바인딩 재생성, `Backend` 인터페이스·Tauri 백엔드 어댑터·`FakeBackend`에 두 메서드 추가 — completion criterion: `up_to_date` 통과, `bunx tsc --noEmit` 오류 없음 (depends: S1)
- [ ] S3. macOS 실제 클립보드 왕복 확인(임시 테스트, 확인 뒤 삭제하고 클립보드 비움) — completion criterion: 쓰기→osascript 읽기, osascript 쓰기→get_files 읽기가 맞다 (depends: S1)
