<!-- forge-slug: system-icons-3of3 -->
<!-- task: 147 -->
<!-- part: 3/3 -->
<!-- tdd: off -->
# 시스템 파일 아이콘 (3/3): Windows 구현

## 목표 / 하지 않을 것
- 목표: `td-icons`의 Windows 구현. `SHGetFileInfoW`로 아이콘(`HICON`)을 얻어 PNG로 낸다. 선행: `system-icons-1of3`(크레이트·`IconSource`). 이 OS(macOS)에서는 실행해 볼 수 없고 컴파일·clippy만 확인한다(`x86_64-pc-windows-msvc` 타깃은 설치되어 있다).
  - `Folder` → 파일 속성 `FILE_ATTRIBUTE_DIRECTORY`, `Extension(ext)` → 점+확장자를 이름으로 하고 `FILE_ATTRIBUTE_NORMAL`과 `SHGFI_USEFILEATTRIBUTES`(파일이 없어도 종류 아이콘), `Path(p)` → 실제 파일(`exe`·`lnk`·`ico` 같은 자기 아이콘이 있는 것)을 `SHGFI_ICON`으로. 크기는 `size_px ≤ 16`이면 `SHGFI_SMALLICON`, 아니면 `SHGFI_LARGEICON`(32)이다(요청 크기와 PNG의 실제 크기가 다를 수 있으며 화면이 맞춰 그린다).
  - `HICON` → PNG: `GetIconInfo`로 색·마스크 비트맵을 얻어 `GetDIBits`(32비트 위에서 아래 BGRA)로 읽고, 알파가 모두 0이면 마스크로 알파를 만들고, BGRA→RGBA로 바꿔 `png` 크레이트로 인코딩한다. 모든 핸들(`HICON`·비트맵·DC)은 반드시 해제한다(`DestroyIcon`·`DeleteObject`·`ReleaseDC`). 호출 스레드에서 COM을 요구하지 않는 경로만 쓴다.
  - 서비스(1of3)의 소스 결정에 Windows 규칙을 더한다: 디스크 위 파일의 확장자가 `exe`·`lnk`·`ico`·`scr`·`cur`이면 `Path`, 그 밖은 `Extension`. 이 목록은 2of3의 프런트 키 규칙과 같다.
- 하지 않을 것: 실행 확인(별도 기기), 큰 아이콘(`SHGetImageList`), Linux, 아이콘 모양 비교 테스트.

## 기준 문서
- 관련 ADR: [ADR-0015](../../docs/adr/0015-windows-office-preview-handler.md)(Windows 전용 코드를 macOS에서 컴파일만 확인하던 선례). 용어: 없음. 선행: `system-icons-1of3`. 참고: `td-cli/Cargo.toml`의 `windows` 의존성 선언, AGENTS.md의 "app 크레이트는 macOS에서 Windows로 교차 검사할 수 없으니 작은 C 없는 크레이트에 둔다".
- 완료 정의(DoD). 작성 시 기준선: `td-icons`에 Windows 구현 없음(`grep SHGetFileInfoW` 0).
  1. `cargo clippy -p td-icons --target x86_64-pc-windows-msvc -- -D warnings` 통과, `grep -c SHGetFileInfoW crates/td-icons/src/*.rs`의 합 ≥ 1. 사전 상태: 0(앞으로 가는 확인).
  2. `cargo test -p td-icons`(macOS)와 `cargo test -p twin-deck-desktop system_icon`이 그대로 통과한다(Windows 코드는 `cfg(windows)`라 macOS 결과를 바꾸지 않는다). 순수 변환 함수(BGRA→RGBA, 마스크 적용 알파 만들기)는 OS와 무관한 함수로 따로 두어 macOS에서도 `cargo test -p td-icons`로 값으로 시험한다(4×4 픽셀 입력 → 기대 RGBA 바이트). 사전 상태: 변환 함수 없음.
  3. 회귀: `cargo fmt --check`, `cargo clippy -p td-icons -p twin-deck-desktop -- -D warnings`(macOS), `bunx tsc --noEmit`, vitest 실패 파일 기준선 2개.
  4. 실제 기기 확인(사람, Windows): 설정을 켜고 목록을 본다 → 탐색기와 같은 아이콘이 뜬다, `.exe`·`.lnk`가 각자의 아이콘, 폴더가 맞다, 끄면 되돌아온다. 이상하면 결과를 알려 주고 이슈로 남긴다.

## 작업 조각
- [ ] S1. OS와 무관한 픽셀 변환 함수(BGRA→RGBA, 마스크로 알파 만들기)와 값 테스트 — 완료 기준: DoD 2의 변환 부분
- [ ] S2. `cfg(windows)` `SHGetFileInfoW` + `GetIconInfo`/`GetDIBits` + PNG 인코딩, 핸들 해제, 서비스의 Windows 소스 규칙 — 완료 기준: DoD 1 (depends: S1)
- [ ] S3. 회귀 — 완료 기준: DoD 3 (depends: S2)
