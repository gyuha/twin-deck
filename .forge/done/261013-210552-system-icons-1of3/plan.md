<!-- forge-slug: system-icons-1of3 -->
<!-- task: 145 -->
<!-- part: 1/3 -->
<!-- tdd: off -->
# 시스템 파일 아이콘 (1/3): `td-icons` 크레이트(macOS)와 서비스·명령·백엔드 연결

## 목표 / 하지 않을 것
- 목표: 운영체제가 파일 종류에 쓰는 아이콘을 PNG로 얻는 작은 크레이트 `crates/td-icons`를 만들고(이 조각은 macOS 구현), 서비스·명령·`Backend`까지 잇는다. 화면과 설정은 2of3, Windows 구현은 3of3.
  - `td-icons`: `pub enum IconSource<'a> { Folder, Extension(&'a str), Path(&'a Path) }`, `pub fn icon_png(source: IconSource, size_px: u32) -> Option<Vec<u8>>`. 크기 0이면 `None`. macOS는 `objc2-app-kit`의 `NSWorkspace`(`iconForFileType`: 확장자 또는 `public.folder`, `iconForFile`: 경로)로 `NSImage`를 얻어 `NSBitmapImageRep`에 `size_px`×`size_px`로 그린 뒤 PNG로 낸다. Windows 외 다른 OS는 `None`(Windows는 3of3 전까지 `None`). 확장자는 소문자로 바꿔 대소문자를 가리지 않고, 비어 있으면 일반 문서 아이콘이다. 의존성 기능(`objc2-app-kit`의 `NSWorkspace`·`NSImage`·`NSBitmapImageRep`·`NSGraphicsContext` 등)은 이 크레이트에만 둔다.
  - `Service::system_icon(path, is_dir, size) -> ServiceResult<Option<String>>`: `data:image/png;base64,…` 또는 `None`. 소스 결정은 서비스가 한다 — 폴더는 `Folder`(macOS는 디스크 위 `.app` 폴더만 `Path`), 파일은 `Extension(ext)`(압축 안 경로 `x.zip!/a.txt`도 이름의 확장자로 얻는다). 결과는 `(키, 크기)`별로 서비스 안에서 캐시한다(512개를 넘으면 비운다, 경로 키가 쌓이지 않게). 아이콘이 없으면 `None`이고 오류가 아니다.
  - 명령 `system_icon(path, is_dir, size)`(`#[tauri::command(async)]`), `Backend.systemIcon(path, isDir, size): Promise<string | null>`, `TauriBackend`, `FakeBackend`(확장자별로 다른 `data:image/png;base64,…` 주소를 돌려주고 호출을 `systemIconCalls`에 기록, `systemIconResponder`로 지연·`null`·거부를 흉내). `task gen-types`.
- 하지 않을 것: 설정 키·화면(2of3), Windows 구현(3of3), Linux, 이미지 썸네일, 디스크에 아이콘 캐시 저장.

## 기준 문서
- 관련 ADR: 없음. 용어: 없음. 선행: 없음. 참고: 기존 `td-cli`(Windows 코드를 C 의존성 없는 작은 크레이트에 두는 방식, AGENTS.md "Platform gotchas"), `service.rs`의 `cbz_preview`·`epub_open` 패턴, 서비스 안 캐시는 `Mutex<HashMap>`.
- 완료 정의(DoD). 작성 시 기준선: `crates/td-icons` 없음, `system_icon`·`systemIcon` 없음(grep 0).
  1. `cargo test -p td-icons`(macOS): 6개 이상. `.txt`·`.png`·폴더 아이콘이 PNG 서명으로 시작하고 IHDR 폭·높이가 요청한 크기(32, 64)와 같으며 세 바이트열이 서로 다르다, `TXT`는 `txt`와 같은 값, 크기 0은 `None`, 경로 소스(`/System/Applications/Utilities/Terminal.app`, 없으면 테스트 건너뜀)도 PNG, 알 수 없는 확장자(`zzqq`)도 PNG. 사전 상태: 없음(앞으로 가는 확인).
  2. `cargo test -p twin-deck-desktop system_icon`(macOS): 4개 이상. 데이터 주소 접두사, 같은 확장자 캐시(두 번째 호출이 같은 값), `txt`≠`png`, 압축 안 경로(`a.zip!/x.txt`)도 확장자로 얻음, 폴더, 크기 0은 `None`. 사전 상태: 없음.
  3. `cargo test -p twin-deck-desktop up_to_date`: `task gen-types` 뒤 통과, `grep -c 'async systemIcon' packages/ts-client/src/generated/bindings.ts` ≥ 1. 사전 상태: 통과(새 명령을 더하면 `gen-types` 전엔 실패하므로 앞으로 가는 확인).
  4. `cd apps/desktop && bunx vitest run src/__tests__/system-icon-backend.test.ts`: `FakeBackend.systemIcon`이 확장자별로 다른 주소를 돌려주고 호출을 기록하며 응답기로 `null`·거부를 흉내 낼 수 있다. 사전 상태: 파일 없음.
  5. 회귀: `bunx tsc --noEmit`, vitest 실패 파일 기준선 2개, `cargo clippy -p td-icons -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`.

## 작업 조각
- [ ] S1. `crates/td-icons`(macOS 구현, 그 외 `None`)와 테스트 — 완료 기준: DoD 1
- [ ] S2. `Service::system_icon`(소스 결정·캐시)·`commands.rs`·`main.rs` 등록과 서비스 테스트 — 완료 기준: DoD 2 (depends: S1)
- [ ] S3. `task gen-types`, `backend.ts`·`tauri.ts`·`fake.ts`, `system-icon-backend` 테스트, 회귀 — 완료 기준: DoD 3·4·5 (depends: S2)
