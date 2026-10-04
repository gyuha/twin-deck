<!-- forge-slug: windows-unmount-and-disk-space -->
<!-- task: 52 -->
<!-- tdd: on -->
# Windows 언마운트(꺼내기)와 디스크 용량 조회 지원

## Goal / Non-goals
- Goal: Windows에서 이동식 드라이브와 네트워크 드라이브를 언마운트할 수 있고, 폴더를 열 때 패널 하단 드라이브 바에 여유/전체 용량이 나온다. 지금은 "이 OS에서는 지원하지 않습니다" / "용량 조회를 지원하지 않습니다"가 나온다.
- 결정 사항:
  - 허용 범위: 이동식 + 네트워크 드라이브만. 고정 디스크(`C:\` 등)는 "이동식/네트워크 드라이브가 아니라서 꺼낼 수 없습니다" 같은 사유로 막는다. macOS의 루트 볼륨 불가 규칙과 같은 취지.
  - 드라이브 종류 판별: `windows-sys`의 `GetDriveTypeW`(REMOVABLE / REMOTE / FIXED …).
  - 꺼내기(이동식): 외부 명령(PowerShell Shell.Application Eject)을 부른다. 기존 macOS `diskutil`/Linux `umount` 방식과 같은 구조(`Unmounter` 트레이트의 `SystemUnmounter`).
  - 연결 끊기(네트워크): `net use X: /delete` 계열 외부 명령.
  - 용량 조회: `GetDiskFreeSpaceExW` 한 번 호출. 폴더 이동마다 불리므로 PowerShell은 쓰지 않는다.
- Non-goals: 고정 디스크 언마운트, UNC 경로(`\server\share`)의 볼륨 목록 지원, 볼륨 목록 자체 변경(지금처럼 존재하는 `A:`~`Z:`), macOS/Linux 동작 변경, 이동식 드라이브 자동 감지 이벤트.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이미 찾은 지점: `crates/td-volumes/src/unmount.rs`(`SystemUnmounter`가 macOS/Linux 외에는 `Unsupported`), `crates/td-volumes/src/space.rs`(`#[cfg(not(unix))]`가 오류), `crates/td-volumes/src/detect.rs`(Windows는 드라이브 문자만 나열, 종류 구분 없음), `crates/td-volumes/Cargo.toml`(Windows 의존성 없음, `libc`는 unix만). 용량 조회 호출처 `apps/desktop/src/state/store.ts:566` → `ui/DriveBar.tsx`.
- Definition of Done (실행 가능, 작성 시점 상태 기재):
  1. `cargo test -p td-volumes` → 통과, 새 Windows 테스트(드라이브 종류 → 허용/거부 분류, 외부 명령 인자, 실패 메시지 변환) 포함. (회귀 방지: 지금 3개 통과. 순방향 새 테스트는 TDD로 먼저 실패하게 작성)
  2. `cargo clippy -p td-volumes -- -D warnings` → 0 (회귀 방지: 이미 통과).
  3. `cargo test -p td-volumes`와 `cargo check -p twin-deck-desktop`가 Windows에서 컴파일됨. macOS/Linux 빌드는 `cfg`로 영향 없음(Windows 전용 의존성은 `[target.'cfg(windows)'.dependencies]`).
  4. 실제 앱(UAT, 사람): ① 드라이브 바에서 `C:\` 폴더를 열면 용량(여유/전체)이 보인다 ② USB를 꽂고 언마운트하면 안전하게 제거 가능 상태가 된다 ③ `C:\` 언마운트 시도는 "이동식/네트워크 드라이브가 아니라서…"로 막힌다 ④ (있다면) 네트워크 드라이브 연결이 끊긴다.

## Work slices
- [ ] S1. (TDD) 드라이브 종류 판별 — `windows-sys`를 `cfg(windows)` 의존성으로 추가하고 `GetDriveTypeW` 결과를 `Removable / Network / Fixed / Other`로 분류하는 순수 함수와 허용 규칙(이동식·네트워크만). 완료 기준: 분류·허용 규칙 테스트가 먼저 실패한 뒤 통과, 고정 디스크는 사유와 함께 거부.
- [ ] S2. (TDD) 용량 조회 — `space.rs`의 Windows 구현(`GetDiskFreeSpaceExW`). 완료 기준: 임시 폴더 경로로 `free <= total`, `total > 0`인 테스트 통과, 없는 경로는 오류 문자열. (S1과 병렬 가능)
- [ ] S3. (TDD) Windows `SystemUnmounter` — 이동식은 꺼내기 명령, 네트워크는 연결 끊기 명령을 실행하고 실패(사용 중 등)를 한국어 메시지로 바꾼다. 명령 인자 생성은 순수 함수로 분리해 테스트. 완료 기준: 인자 생성·오류 변환 테스트 통과, `Unsupported`는 Windows에서 더는 안 나옴. (depends: S1)
- [ ] S4. 실제 앱 확인 — DoD 4를 사람이 확인(UAT). 필요하면 `docs/`의 볼륨 문서에서 Windows 지원 문구를 갱신. (depends: S2, S3)
