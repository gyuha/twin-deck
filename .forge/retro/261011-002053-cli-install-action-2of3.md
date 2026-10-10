# 2026-10-11 — 앱 안의 "명령줄 도구 설치/제거" 액션 (이슈 #45, 2/3)

## Plan vs actual
- What went as planned: 순수 로직 → 실행부 → 명령·DTO → ts-client → 액션·스토어 순으로 TDD, 테스트 순서도 계획대로(red 9 → 6 → 7).
- Divergences:
  - **설치 로직을 앱 크레이트가 아니라 별도 `crates/td-cli`로 옮겼다.** 앱 크레이트는 `zstd-sys`의 C 빌드 때문에 이 머신에서 Windows 대상 컴파일이 안 되지만, C 의존성이 없는 작은 크레이트는 `cargo check`·`clippy --target x86_64-pc-windows-msvc`가 통과한다. 덕분에 Windows 코드를 처음으로 컴파일 확인했다.
  - 관리자 암호 창을 실제로 띄우는 것은 사용자 시스템을 바꾸는 일이라 하지 않았다. 대신 생성한 AppleScript를 `osacompile`로 컴파일만 해 보는 macOS 전용 테스트를 더했다.

## Learnings
- Do differently next time: 이 환경에서 확인할 수 없는 플랫폼 코드는 **작은 의존성 없는 크레이트에 격리**하고 대상 컴파일(`rustup target add …`)로 최소한의 확인을 한다. 사용자 시스템·권한을 바꾸는 동작은 "실행하지 않고 확인할 수 있는 만큼"(문법 컴파일, 클로저로 주입한 가짜 관리자 실행기)으로 줄이고, 나머지는 사람 확인 항목으로 명시한다.
- 시스템 권한 상승 명령은 고정된 두 개로 제한하고 경로를 이스케이프하는 단위 테스트를 둔다는 계획이 그대로 통했다.

## Doc updates
- CONTEXT.md promotion: none
- ADR added: ADR-0017에 크레이트 분리 결정을 함께 기록
- AGENTS.md: Windows 컴파일 확인 요령 한 줄 추가
