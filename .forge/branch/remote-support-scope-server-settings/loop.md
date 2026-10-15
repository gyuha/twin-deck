# LOOP — Twin Deck Remote: SSH/SFTP 내장 서버 + 원격 터미널 + 설정 탭 (이슈 #72)
started: 2026-10-16
replan-round: 0
replan-cap: 5
budget-tokens: none
budget-spent: 0 · since: 2026-10-16T00:00:00Z
retro: skip
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `cargo test -p td-remote` 통과. 새 서버 테스트 포함: 내장 서버를 127.0.0.1:0에 띄우고 기존 SFTP 클라이언트로 비밀번호 로그인 후 목록·읽기·쓰기·이름 바꾸기·삭제가 되고, 틀린 비밀번호는 거부된다.
- [ ] C2. 공유 범위 테스트 통과: 루트 밖 접근(`..`, 절대경로, 심볼릭 링크 탈출)이 거부되고, 읽기 전용(allow_write=false)이면 쓰기 계열이 모두 거부된다. (`cargo test -p td-remote server_jail`)
- [ ] C3. PTY 셸 채널 테스트 통과(unix): 클라이언트로 셸을 열어 `echo <마커>`를 보내면 마커가 출력으로 돌아온다. (`cargo test -p td-remote server_shell`)
- [ ] C4. 호스트키 테스트 통과: 서버를 껐다 켜도 호스트키 지문이 같다. (`cargo test -p td-remote server_host_key`)
- [ ] C5. `[remote_server]` 설정 키(enabled·bind·port·root·allow_write 등, 기본 enabled=false·bind=127.0.0.1)가 있고 `cargo test -p twin-deck-desktop up_to_date`가 통과한다.
- [ ] C6. 설정 `연결 > Twin Deck Remote` 탭이 있다. vitest: 서버 켜기·끄기가 Backend 호출로 이어지고, 접속 주소를 추가·수정·삭제할 수 있으며, 설정 탭 목록 테스트가 갱신돼 있다. (`cd apps/desktop && bunx vitest run src/__tests__/twin-deck-remote.test.tsx`)
- [ ] C7. 클라이언트 원격 터미널 테스트 통과: `twindeck` 연결에서 터미널을 열면 입출력이 오간다(Rust 서비스 테스트 `cargo test -p twin-deck-desktop remote_terminal` + FakeBackend vitest).
- [ ] C8. 회귀 방지: `cargo fmt --check`, `cargo clippy -p td-remote -p td-config -p twin-deck-desktop -- -D warnings`, `cargo test --workspace`(`service::tests::coalesce_*`가 단독 통과하면 알려진 잡음으로 본다), `cd apps/desktop && bunx vitest run` 전체, `cd apps/desktop && bunx tsc --noEmit`이 모두 통과한다.
- [ ] C9. 문서: `docs/adr/0021-*.md` 존재(범위·보안 결정), 액션·키가 바뀌었다면 `docs/05-actions-keybindings.md` 갱신, README.md와 README.en.md 쌍이 같은 커밋에서 갱신돼 있다.

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C2: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C3: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C4: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C5: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C6: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C7: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C8: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"
- C9: pending ×0 · regressed: ×0 · last-evidence: "아직 실행 전"

## Authorized replan scope
- 위 체크 실패에 직접 대응하는 수정 작업만(체크와 추적 가능한 fix-forward). 그 밖은 하지 않는다.
- 범위 밖(고정): 원격 압축·해제(SFTP에 서버측 연산 없음), 클라이언트의 호스트키 검증(TOFU), 공개키 인증, 서버 기본 켜짐, `0.0.0.0` 기본 수신, 릴리스·배포·push.
- 결정 사항: 프로토콜=SSH/SFTP 내장 서버(russh), 인증=비밀번호(OS 키체인)+서버 호스트키 영속, 공유 범위=사용자가 고른 루트 하위만(쓰기 허용 스위치 기본 끔), "접속 주소 관리" = 서버 수신 주소·포트 표시/수정 + 접속할 Twin Deck 서버 목록(`remote.servers`의 `protocol = "twindeck"`) 편집, 원격 터미널은 `twindeck` 연결에서만.
- always-halt action classes (safety wall — default set, override/extend per loop): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure

## Tasks
- remote-server-core-1of7
- remote-server-sftp-2of7
- remote-server-shell-3of7
- remote-server-config-bridge-4of7
- remote-server-settings-tab-5of7
- remote-client-terminal-6of7
- remote-server-docs-7of7
