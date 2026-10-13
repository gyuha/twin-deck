<!-- forge-slug: system-icons-1of3 -->
# 실행 기록 — 시스템 파일 아이콘 (1/3) td-icons(macOS)와 연결

## 한 일
- `crates/td-icons`(새, 워크스페이스에 추가): `IconSource{Folder,Extension,Path}`, `icon_png(source, size_px)`, `normalize_ext`. macOS는 `NSWorkspace`(`iconForFileType`/`iconForFile`)의 `NSImage`를 `NSBitmapImageRep`에 그려 PNG로 낸다(전역 Mutex로 그리기를 직렬화, autoreleasepool). 그 밖의 OS는 `None`. 테스트 9개(PNG 서명·IHDR 크기 32/64, 세 종류가 서로 다름, 대소문자·점 무시, 모르는/빈 확장자, `.app` 경로, 없는 경로, 8스레드 동시).
- 눈으로 확인: 128px 덤프를 열어 텍스트 문서 아이콘과 Terminal 앱 아이콘이 투명 배경으로 제대로 나오는 것을 봤다(임시 예제는 지웠다).
- `service.rs`: `Service::system_icon(path, is_dir, size)`, 소스 결정 `icon_source`(폴더·디스크 위 `.app`은 경로·파일은 소문자 확장자·압축 안은 확장자·점 이름은 확장자 없음), `(키, 크기)` 캐시(512개 넘으면 비움). 테스트 4개. `commands.rs`·`main.rs`: `system_icon` 명령.
- `task gen-types`, `Backend.systemIcon`·`TauriBackend`·`FakeBackend`(확장자별 다른 PNG 주소, `systemIconCalls`, `systemIconResponder`), `system-icon-backend.test.ts` 3개.

## 계획과 실제
- 계획과 같다. 한 가지 정정: 계약 C3(와 계획 DoD 3)에 "bindings에서 `grep -c systemIcon` ≥ 2"라고 썼는데 생성 파일에서 명령 하나는 한 줄이라 달성할 수 없는 조건이었다. 실행 전에 `grep -c 'async systemIcon'` ≥ 1로 고쳤다(의도는 같다: 바인딩이 생겼다).
- AGENTS.md는 vitest가 전부 통과한다고 하지만 이 기기에서는 여전히 `model-formats`·`pdf-preview`가 실패한다(기준선 그대로).

## 검증
- C1 td-icons 9 통과. C3 system_icon 4·up_to_date 2 통과, bindings에 `async systemIcon` 1줄. C6 tsc 통과, vitest 1220 통과·실패 기준선 2개 파일뿐, clippy -D warnings(td-icons·twin-deck-desktop)·fmt 통과, cargo test -p twin-deck-desktop 119 통과.
- 남은 확인(자동화 불가): 실제 앱에서 목록에 아이콘이 뜨는 것(2of3 이후).
