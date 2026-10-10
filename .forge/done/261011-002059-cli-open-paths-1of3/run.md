# run — td 명령 핵심 (1/3, 이슈 #45)

fg-run이 워크플로 없이 직접 실행했다. TDD: 테스트를 먼저 쓰고 실패(10건 red)를 확인한 뒤 구현했다.

## 슬라이스별 결과
- S1 `cli.rs`: `parse_args`·`absolute`(어휘적 절대 경로)·`invoked_as_td`·`should_detach`, 테스트 10건 — ✅ as planned
- S2 `main.rs`: `td` 이름일 때 오류 출력·종료 코드(1·2) 또는 자기 재실행으로 터미널에서 떨어져 나오기(unix) — ⚠ 계획과 다른 점 하나: 재실행 경로를 `current_exe()` 그대로 쓰면 심볼릭 링크(`/opt/homebrew/bin/td`) 경로가 되어 앱 번들의 리소스 폴더를 못 찾을 수 있어 `canonicalize`한 실제 경로로 띄우도록 고쳤다(실제 실행 확인 중 발견)
- S3 single-instance(2.4.5)·시작 인수 상태 `LaunchPaths`·`take_launch_paths`·`OpenPaths` 이벤트·DTO·`gen-types` — ⚠ 계획에 없던 수정 둘: (a) `capabilities_cover_plugins` 테스트가 새 플러그인의 권한을 요구해서 권한 파일이 없는 플러그인 목록(`single-instance`)을 예외로 뒀다 (b) 개발·시험에서 여러 개를 띄울 수 있게 `TWIN_DECK_MULTI=1`로 단일 인스턴스를 끄는 길을 더했다(`AGENTS.md`에 적음)
- S4 ts-client: `takeLaunchPaths`·`onOpenPaths`·`FakeBackend.launchPaths/emitOpenPaths`, 테스트 3건 — ✅ as planned
- S5 스토어 `openPaths`·`openFolderTab`(같은 폴더 탭이면 활성화), 시작 시 `init` 끝에서 한 번 적용, 구독, `open-paths.test.tsx` 7건 — ✅ as planned
- S6 문서(`docs/01` CLI-01, `docs/09` §9, `AGENTS.md`)와 회귀 확인 — ⚠ 새 Rust 문구 때문에 `i18n-rust-messages` 테스트가 실패해 `rust.ts`에 영어 대응 2건과 내부용 4건을 더했다

## DoD baseline → after
1. `cargo test -p twin-deck-desktop cli::`: 0 → 10 통과 (앞으로 가는 확인)
2. `up_to_date`: 통과 → 통과 (gen-types 반영 확인)
3. ts-client vitest: 58 → 61 통과 (시작 경로 계약 3건)
4. `open-paths.test.tsx`: 없음 → 7 통과
5. 회귀: `tsc` 통과, vitest 1160 통과·실패는 기준선 `pdf-preview`+`model-formats` 뿐, `clippy -p twin-deck-desktop`·`fmt` 통과, `twin-deck-desktop` 107 통과, `packages/actions` 19, ko/en 키 일치
6. 실제 확인(macOS 개발 빌드, `/tmp/td` 링크, 격리 HOME + `TWIN_DECK_MULTI`):
   - (iii) `td nonexistent-xyz` → `td: 경로를 찾을 수 없습니다: nonexistent-xyz`, 종료 코드 1 ✅. `td a b c`·`td --new-window` → 사용법, 종료 코드 2 ✅
   - (i) 앱이 꺼진 채 `td /tmp` → 0초에 종료 코드 0으로 돌아오고 앱 프로세스가 남는다(부모 PID 1, `TD_DETACHED=1` 확인) ✅. **그 앱 창에 폴더가 왼쪽 패널 새 탭으로 열렸는지는 눈으로 보지 못했다.**
   - (ii) 앱이 켜진 채 `td /Users`, `td /private`을 이어서 쳤을 때 앱 프로세스는 처음 하나뿐(새 프로세스가 남지 않음) ✅ — 단일 인스턴스가 동작한다. **그 앱에 탭이 생기고 창이 앞으로 왔는지는 눈으로 보지 못했다**(경로 전달은 단위·UI 테스트가 이벤트 수준으로 확인).

## 어긋난 점·한계
- 창이 실제로 앞으로 오는지, 탭이 실제로 보이는지, 시작 인수 적용이 저장된 상태 복원 뒤에 일어나는지는 실제 화면에서만 확인된다(사람 몫). 테스트는 `FakeBackend` 이벤트 수준이다.
- Windows는 코드를 건드리지 않았고(떨어져 나오기는 `cfg(unix)`) 이 환경에서 컴파일도 확인하지 못했다(Windows 대상이 설치돼 있지 않다). `launch_request`·`parse_args`는 플랫폼 중립 코드다.
- 사용자의 `/Applications/Twin Deck.app`(옛 버전)이 실행 중이어서, 확인은 모두 `TWIN_DECK_MULTI=1`·격리 HOME으로 띄운 개발 빌드에서만 했고, 만든 프로세스는 모두 종료했다.
- 같은 폴더 탭 중복은 `t.path === folder`의 단순 문자열 비교다(끝 슬래시·대소문자 차이는 같은 폴더로 보지 않는다).
