# run — 앱 안의 "명령줄 도구 설치/제거" 액션 (2/3, 이슈 #45)

fg-run이 워크플로 없이 직접 실행했다. TDD: 테스트를 먼저 쓰고 실패(순수 로직 9건, 실행부 6건, UI 7건 red)를 확인한 뒤 구현했다.

## 슬라이스별 결과
- S1 순수 로직(링크 판단, 셸·AppleScript 인용, PATH 더하기·빼기, `td.cmd` 내용) + 테스트 9건 — ⚠ 계획과 다른 점: **앱 크레이트 안의 `cli_install.rs`가 아니라 별도 크레이트 `crates/td-cli`로 뒀다.** 앱 크레이트는 `zstd-sys`의 C 빌드 때문에 Windows 대상 컴파일이 안 되는데, 이 작은 크레이트는 C 의존성이 없어 `cargo check --target x86_64-pc-windows-msvc`로 Windows 코드를 실제로 컴파일해 볼 수 있다. DoD 1의 명령은 `cargo test -p td-cli`로 바뀐다.
- S2 실행부: unix `install_at`/`uninstall_at`(직접 만들기 → 권한 부족·폴더 없음이면 `admin` 클로저로 고정 명령 실행, 남의 `td`는 덮어쓰지도 지우지도 않음), macOS `osascript` 관리자 암호 창(취소는 `-128`로 판별), `cfg(windows)`의 `td.cmd` 쓰기·`HKCU\Environment\Path` 읽기/쓰기(값 종류 유지)·`WM_SETTINGCHANGE` 알림 — ✅ as planned (실행부 테스트 6건)
- S3 명령 `cli_status`·`cli_install`·`cli_uninstall`(비동기 + `spawn_blocking`으로 암호 창이 UI 스레드를 막지 않음), DTO, `gen-types`, ts-client(`Backend`·`Tauri`·`Fake`) + 계약 테스트 4건 — ✅ as planned
- S4 액션 `core.cli.install`·`core.cli.uninstall`(기본 키 없음, global), 스토어 흐름(상태 확인 → 확인 창 → 설치/제거 → 알림), ko/en 문구, `cli-install.test.tsx` 7건, `docs/05` — ⚠ 새 Rust 문구 17건을 `rust.ts` 대응표에 영어로 더했다(대응표 테스트가 요구)

## DoD baseline → after
1. `cargo test -p td-cli`: 0 → 16 통과 (순수 15 + macOS 전용 `osacompile` 문법 시험 1). 계획의 "임시 폴더를 쓴 링크 만들기·지우기(unix)"도 포함
2. `up_to_date`: 통과 → 통과 (gen-types 반영)
3. ts-client vitest: 61 → 65 통과 (설치 계약 4건)
4. `cli-install.test.tsx`: 없음 → 7 통과
5. 회귀: `tsc` 통과, vitest 1167 통과·실패는 기준선 `pdf-preview`+`model-formats`뿐, `clippy -p twin-deck-desktop -p td-cli`(macOS)·`clippy -p td-cli --target x86_64-pc-windows-msvc`·`fmt` 통과, `twin-deck-desktop` 107, `packages/actions` 19, ko/en 키 일치
6. 실제 확인:
   - macOS: 생성한 AppleScript(작은따옴표·큰따옴표·백슬래시가 든 경로 포함)가 `osacompile`로 **문법상 컴파일**된다 ✅. **관리자 암호 창을 실제로 띄워 `/usr/local/bin/td`를 만드는 것은 사용자 시스템을 바꾸는 일이라 하지 않았다**(이 머신에는 `/usr/local/bin/td`가 없다). 사람이 확인해야 한다.
   - Windows: **`cargo check`·`clippy`(`x86_64-pc-windows-msvc`, `td-cli` 크레이트)가 통과해 Windows 코드가 컴파일되는 것까지** 확인했다. 레지스트리·PATH 반영·`td.cmd` 동작은 실제 Windows에서만 확인된다(사람 몫). 이 확인을 위해 이 머신에 `rustup target add x86_64-pc-windows-msvc`를 했다(`rustup target remove`로 되돌릴 수 있다).

## 어긋난 점·한계
- 앱 크레이트 전체는 이 머신에서 Windows 대상으로 컴파일할 수 없다(`zstd-sys`가 MSVC C 도구를 요구). 이번 작업의 Windows 코드는 `td-cli` 크레이트에 있어 확인됐지만, 앱 크레이트 쪽 Windows 코드(`commands.rs`의 DTO 변환 등)는 플랫폼 중립이다.
- Windows 설치는 `td.cmd`를 앱 폴더에 쓰고 PATH에 그 폴더를 더한다. 앱이 `Program Files`처럼 쓰기 권한이 없는 곳에 설치돼 있으면 `td.cmd` 쓰기가 실패한다(오류는 알림으로 보임). 설치 파일(3번 계획)이 설치 시점에 `td.cmd`를 쓰므로 그 경우는 설치 파일 경로를 쓰는 것이 맞다.
- 제거 시 Windows의 `td.cmd`는 이 앱이 쓴 내용과 같을 때만 지운다.
- 개발 빌드(`target/debug`)에서 설치 액션을 누르면 링크가 개발용 실행 파일을 가리킨다(확인 창이 대상 경로를 보여 주지만 막지는 않는다).
