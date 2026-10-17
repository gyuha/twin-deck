<!-- forge-slug: remote-reconnect-stale-session -->
<!-- task: 196 -->
<!-- priority: high -->
<!-- tdd: off -->
# 끊긴 원격 세션을 다시 연결하면 새 세션으로 바꿔 끼운다 (이슈 #98 ①)

## Goal / Non-goals
- Goal: 원격(SFTP) 세션이 끊긴 뒤 같은 서버에 다시 연결하면(설정의 "연결", 연결 메뉴 등 `remote_connect`) 레지스트리에 남은 **죽은 세션을 재사용하지 않고 버리고 새로 접속**한다. 지금은 `connect_remote`가 같은 id의 세션이 있으면 그 세션의 `home()`만 불러 루트를 돌려주는데, 세션이 죽었으면 `home()`이 오류를 내고 죽은 세션은 그대로 남아 앱을 다시 시작할 때까지 계속 실패한다(`base_dir`이 있으면 `home()`도 안 불러서 죽은 세션의 경로를 "연결됨"으로 돌려준다). 또 끊긴 세션으로 목록·읽기 등을 하면 **안정된 문구 "원격 연결이 끊어졌습니다"**로 실패시켜 UI가 끊김을 알아볼 수 있게 한다(레지스트리에 세션이 아예 없을 때의 "원격 연결이 열려 있지 않습니다"와 구분된다).
- Non-goals: UI(패널 오버레이·버튼·액션 — plan `remote-disconnected-reconnect-overlay`). FTP 세션(제어 연결이 끊기면 `with_ctrl`이 한 번 다시 연결하므로 이미 스스로 복구한다 — `is_alive` 기본값 `true` 그대로). 자동 재연결·백오프·하트비트. `Type`을 derive한 구조체·명령 시그니처 변경(그래서 `task gen-types` 불필요). 원격 셸(터미널) 세션 복구. 연결 도중(작업 중간)에 끊긴 한 번의 오류를 안정된 문구로 바꾸는 일(그 다음 접근부터 안정된 문구가 나온다).

## Source of truth
- Glossary terms: none
- Related ADRs: ADR-0019 (원격 세션은 앱 안 클라이언트, 레지스트리가 id별로 보관) — `.forge/adr/0019-remote-fs-in-process.md`가 있으면 그것, 없으면 none
- Definition of Done:
  1. `cargo test -p twin-deck-desktop -p td-archive -p td-remote 재연결` 의 `test result` 줄들에서 통과 수의 합이 **6 이상**이고 실패 0 (사전 상태는 1개 — 이름에 "재연결"이 든 기존 호스트 키 시험 `미승인_최초키와_취소는_인증하지_않고_승인후_재연결은_저장키를_쓴다` 하나뿐이라, 합 6 이상은 새 시험이 5개 이상 있어야 한다). 새 시험 이름에는 모두 "재연결"을 넣는다. 최소 이 다섯을 단언한다: (a) `is_alive()`가 거짓인 세션이 레지스트리에 있을 때 `connect_remote`가 `opener`를 **정확히 1번** 부르고 새 세션으로 바꿔 끼우며 새 루트 주소를 돌려준다(그 뒤 `list_dir`가 새 세션으로 성공한다) (b) `is_alive()`는 참이지만 `home()`이 오류인 세션도 같은 식으로 교체된다 (c) `base_dir`이 있는 대상에서도 (a)와 같다(죽은 세션의 경로를 "연결됨"으로 돌려주지 않는다) (d) 끊긴(`is_alive()` 거짓) 세션에 `list_dir`를 하면 오류 문구가 정확히 "원격 연결이 끊어졌습니다"이고, 세션이 아예 없을 때의 "원격 연결이 열려 있지 않습니다"와 다르다 (e) 실제 SFTP 시험 서버(`FakeSftp`)에 접속한 `SftpSession`은 `is_alive()`가 참이고, 서버를 내리면(`drop`) 최대 5초 안에 `is_alive()`가 거짓이 되고 `home()`이 오류가 된다(폴링).
  2. 기존 원격 시험이 그대로 통과한다: `cargo test -p td-remote -p td-archive` 실패 0, `cargo test -p twin-deck-desktop remote` 실패 0이고 통과 수가 **36 이상** (회귀 가드: 지금 36 통과 — 특히 "이미 열린 연결은 다시 접속하지 않고 재사용한다" 시험이 그대로 통과해야 한다).
  3. `cargo fmt --all -- --check` 종료 코드 0, `cargo clippy -q -p td-remote -p td-archive -p twin-deck-desktop -- -D warnings` 종료 코드 0 (회귀 가드: 지금도 통과한다).
  4. 범위: `git diff --name-only ef70ff6 -- packages/ts-client/src/generated apps/desktop/src` 출력이 비어 있다(이 plan은 TS·생성 바인딩을 건드리지 않는다), 그리고 `git diff ef70ff6 -- Cargo.toml '*/Cargo.toml' Cargo.lock`의 `+` 줄 중 의존성 추가가 없다(회귀 가드: 지금도 비어 있다).

## Work slices
- [ ] S1. `td-remote`: `RemoteSession`에 `fn is_alive(&self) -> bool { true }`(기본값)을 더하고 `SftpSession`이 `!self._handle.is_closed()`로 구현한다(russh 0.63의 `Handle::is_closed`). 필드 이름의 밑줄 접두사는 이제 쓰이므로 맞춰 고친다 — completion criterion: DoD 1의 (e)
- [ ] S2. `td-archive`의 `RemoteRegistry::session()`: 세션이 있는데 `!is_alive()`면 `other(path, REMOTE_DISCONNECTED)`로 실패한다. 문구는 `pub const REMOTE_DISCONNECTED: &str = "원격 연결이 끊어졌습니다"`로 한 곳에 둔다(UI가 같은 문구로 알아본다) — completion criterion: DoD 1의 (d)
  (depends: S1)
- [ ] S3. `service::connect_remote`: 레지스트리에 같은 id의 세션이 있으면 `is_alive()`와 `home()`으로 살아 있는지 확인하고(시작 폴더가 있어도 확인한다) 살아 있으면 지금처럼 재사용, 아니면 `registry.remove(&id)` 뒤 새로 접속한다(비밀번호·키체인·호스트 키 흐름은 그대로). `remote_connections`가 죽은 세션을 "연결됨"으로 세지 않게 하는 것은 이번 범위가 아니다 — completion criterion: DoD 1의 (a)(b)(c), DoD 2
  (depends: S1)
- [ ] S4. 시험: DoD 1의 다섯 시험을 쓴다. 죽은 세션은 시험용 `RemoteSession` 구현(`is_alive` 거짓 / `home()` 오류)으로 만들고, (e)는 실제 `FakeSftp`로 한다 — completion criterion: DoD 1
  (depends: S2, S3)
