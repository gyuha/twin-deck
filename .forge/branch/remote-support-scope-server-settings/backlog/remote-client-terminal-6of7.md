<!-- forge-slug: remote-client-terminal-6of7 -->
<!-- task: 183 -->
<!-- part: 6/7 -->
<!-- tdd: off -->
# 클라이언트 원격 터미널: twindeck 연결에서 셸 열기 (6/7)

## Goal / Non-goals
- Goal: `twindeck` 연결의 패널에서 원격 터미널을 열 수 있다. 기존 내장 터미널 UI(`TerminalView`)를 재사용하고, Backend에 원격 터미널 열기·쓰기·크기·닫기를 추가한다(Rust 서비스는 3/7의 클라이언트 `open_shell` 사용). 액션과 키는 기존 터미널 액션에 맞춘다.
- Non-goals: 일반 SFTP 서버의 터미널, 새 단축키 대량 추가.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0019-remote-fs-in-process.md
- Definition of Done: `cargo test -p twin-deck-desktop remote_terminal` 통과(서비스가 서버 셸과 입출력을 주고받음), FakeBackend vitest 통과(원격 터미널 열기·입출력), 액션·키를 추가했다면 `docs/05-actions-keybindings.md`와 `fkey-bindings.test.tsx`가 맞게 갱신, tsc·clippy 통과.

## Work slices
- [ ] S1. 서비스·명령·Backend(원격 터미널 열기/쓰기/크기/닫기) — 완료 기준: `remote_terminal` 서비스 테스트 통과.
- [ ] S2. UI 연결(액션, TerminalView 재사용, 원격 표시) — 완료 기준: FakeBackend vitest 통과(depends: S1).
