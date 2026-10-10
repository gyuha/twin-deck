<!-- forge-slug: cli-open-paths-1of3 -->
<!-- task: 134 -->
<!-- part: 1/3 -->
<!-- tdd: on -->
# td 명령 핵심: 터미널에서 넘긴 폴더를 앱의 왼쪽·오른쪽 패널에 새 탭으로 연다 (1/3)

## 목표 / 하지 않을 것
- 목표: 개발 빌드에서 `td`라는 이름의 링크로 `td .`를 치면 Twin Deck이 그 폴더를 연다. (GitHub 이슈 #45의 핵심 절반) 이미 떠 있으면 실행 중인 앱에 경로를 넘겨 활성 창 **왼쪽 패널**에 새 탭으로 열고, 안 떠 있으면 앱을 띄우며 열린다. 설치·PATH 등록은 2·3번 계획이다.
  - 인수 규칙(합의, `td 인수`): 인수 없음 → 앱만 띄우거나 앞으로 가져오고 탭은 만들지 않는다. 폴더 1개 → 왼쪽 패널 새 탭. 폴더 2개 → 왼쪽·오른쪽 패널 각각 새 탭. 파일 → 그 파일이 든 폴더를 열고 커서를 파일에 둔다(실행하지 않음, 압축 파일도 같음). 없는 경로 → 터미널에 오류를 출력하고 종료 코드 1, 앱은 띄우지 않는다(macOS). 3개 이상이거나 `-`로 시작하는 옵션 → 사용법을 출력하고 종료 코드 2. 상대 경로는 `td`를 친 터미널의 현재 폴더 기준으로 절대 경로로 바꾼다(심볼릭 링크를 풀지 않는 어휘적 절대 경로).
  - 실행 중인 앱으로 넘기기: `tauri-plugin-single-instance`(안정 2.x, 3.0 알파는 쓰지 않는다). 나중에 뜬 프로세스의 인수·현재 폴더를 먼저 떠 있던 앱이 받아(콜백) 같은 규칙으로 해석하고, 이벤트로 화면에 알린 뒤 창을 앞으로 가져온다(최소화 해제 · 보이기 · 포커스). 창이 여럿이면 레이블 `main` 창, 없으면 첫 창.
  - 터미널에서 떨어져 나오기(macOS·Linux): 실행 파일의 `argv[0]` 이름이 `td`일 때만, `TD_DETACHED`가 없으면, 인수 검증이 통과한 뒤 **자기 자신을 새 프로세스로 다시 실행**(환경변수 `TD_DETACHED=1`, 표준 입출력 닫음, 새 프로세스 그룹)하고 부모는 종료 코드 0으로 끝난다. 그래서 `td .` 뒤에 터미널이 바로 돌아온다. `tauri dev`·Finder 실행·`twin-deck-desktop` 이름 실행에는 영향이 없다. Windows는 떨어져 나오기를 하지 않는다(GUI 앱이라 `start`로 띄우는 `td.cmd`가 3번 계획).
  - 처음 시작하는 앱: 시작 인수를 한 번 해석해 상태로 들고 있고, 화면이 저장된 상태를 복원한 **뒤에** `take_launch_paths` 명령으로 한 번 가져가 적용한다(가져가면 비운다). 해석 오류(Windows의 없는 경로 등)는 앱 안 알림으로 보인다.
  - 화면 적용: 왼쪽 경로 → 왼쪽 패널에 새 탭을 만들어 활성으로 하고 그 탭이 속한 패널을 활성 패널로 한다. 오른쪽 경로 → 오른쪽 패널에 새 탭. **그 패널에 같은 폴더를 보는 탭이 이미 있으면 새로 만들지 않고 그 탭을 활성으로 한다**(같은 `td .`를 여러 번 쳐도 탭이 쌓이지 않게). 저장된 탭·폴더는 그대로 둔다. 가상 탭(검색 결과 등)이 활성이어도 새 탭만 더한다.
- 하지 않을 것: 설치·링크·PATH 등록(2·3번) · `--new-window`·`--existing-tab` 등 옵션 · 3개 이상의 경로 · 앱 안의 "명령줄 도구 설치" 액션 · Windows의 `td.cmd`와 설치 파일 · 창이 여럿일 때 가장 최근 활성 창 추적

## 기준 문서
- 용어: `.forge/CONTEXT.md`의 "td 명령"
- 관련 ADR: 없음
- 관련 문서: `docs/01-feature-spec.md` CLI-01, `docs/09-platform-support.md` §9
- 이슈 추적: GitHub 이슈 #45
- 갱신할 문서: `docs/01`(CLI-01 상태), `docs/09`(§9 인수 규칙)
- 완료 정의(DoD):
  1. `cargo test -p twin-deck-desktop cli::` 통과 ≥ 10, 실패 0 (사전 상태: 0건 — 앞으로 가는 확인). `cli.rs`의 순수 함수를 단언한다: 인수 없음→빈 요청, `.`와 상대 경로가 주어진 현재 폴더 기준 절대 경로(심볼릭 링크를 풀지 않음), 두 경로→왼쪽·오른쪽, 파일→폴더+`focus` 이름, 공백이 든 경로 유지, 없는 경로→`NotFound`(종료 코드 1), 인수 3개→`Usage`(2), `--new-window`→`Usage`(2), `argv[0]`이 `td`·`/usr/local/bin/td`일 때만 `td`로 부른 것으로 판정(`twin-deck-desktop`·`td-old`는 아님), 떨어져 나올지 판정(`argv0=td`·`TD_DETACHED` 없음·검증 통과일 때만)
  2. `cargo test -p twin-deck-desktop up_to_date` 통과 (사전 상태: 통과 — 새 DTO·명령·이벤트를 더하면 `task gen-types` 전에는 실패하므로 gen-types 반영 확인용)
  3. `cd packages/ts-client && bunx vitest run` 통과, 시작 경로 계약 테스트 ≥ 2 포함 (사전 상태: 58건 통과, 시작 경로 테스트 없음 — 앞으로 가는 확인): `FakeBackend`의 `takeLaunchPaths`(한 번 가져가면 비움)·`emitOpenPaths`
  4. `cd apps/desktop && bunx vitest run src/__tests__/open-paths.test.tsx` 통과 ≥ 7, 실패 0 (사전 상태: 파일 없음): (a) 시작 경로가 왼쪽 패널 새 탭으로 열리고 저장된 탭이 남는다 (b) 두 경로가 왼쪽·오른쪽 (c) 실행 중 이벤트로도 같은 적용 (d) 같은 폴더 탭이 이미 있으면 그 탭을 활성으로(탭 수 불변) (e) 파일 대상은 커서가 그 파일에 놓인다 (f) 오류는 알림을 보이고 탭을 만들지 않는다 (g) 인수 없음은 아무것도 열지 않는다
  5. 회귀 방지(사전 상태: 이미 통과): `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run`의 실패가 기준선(`pdf-preview` 1건, `model-formats` 파일 로드)뿐, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cargo fmt --check`, `cargo test -p twin-deck-desktop`(기준선 소음 `coalesce_*`만 예외), `packages/actions` 테스트, `ko`/`en` 키 일치
  6. 실제 앱 확인(자동 검증 불가, 사람이 한다): macOS 개발 빌드에서 `ln -s <target/debug/twin-deck-desktop> /tmp/td` 뒤 (i) 앱이 꺼진 채 `/tmp/td .` → 앱이 뜨고 터미널이 바로 돌아오며 그 폴더가 왼쪽 패널 새 탭 (ii) 앱이 켜진 채 `/tmp/td ~` → 같은 앱에 탭이 생기고 창이 앞으로 옴, 새 창·두 번째 프로세스가 생기지 않음 (iii) `/tmp/td 없는경로` → 오류와 종료 코드 1. 단일 인스턴스·창 포커스·터미널 분리는 jsdom·단위 테스트가 볼 수 없다.

## 작업 조각
- [ ] S1. (red→green) `apps/desktop/src-tauri/src/cli.rs`: `parse_args`·`resolve`·`invoked_as_td`·`should_detach`와 오류 종료 코드, 테스트를 먼저 쓴다. — 완료 기준: DoD 1
- [ ] S2. `main.rs`: `td` 이름일 때 오류 출력·종료 또는 자기 재실행으로 떨어져 나오기(unix). (depends: S1) — 완료 기준: DoD 1의 판정 테스트, DoD 6(i)
- [ ] S3. single-instance 플러그인(콜백에서 해석·`OpenPaths` 이벤트·창 앞으로), 시작 인수 상태와 `take_launch_paths` 명령, DTO, `task gen-types`. (depends: S1) — 완료 기준: DoD 2, DoD 6(ii)
- [ ] S4. ts-client: `Backend.takeLaunchPaths`·`onOpenPaths`, `TauriBackend`, `FakeBackend` + 계약 테스트. (depends: S3) — 완료 기준: DoD 3
- [ ] S5. 스토어 `openPaths`(중복 탭 활성화·커서·알림)와 `bootstrap`/앱 시작 시 한 번 적용, 구독 설정, `open-paths.test.tsx`. (depends: S4) — 완료 기준: DoD 4
- [ ] S6. 문서(`docs/01`, `docs/09`)와 회귀 확인. (depends: S5) — 완료 기준: DoD 5
