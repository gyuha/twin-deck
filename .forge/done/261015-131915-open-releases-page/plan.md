<!-- forge-slug: open-releases-page -->
<!-- task: 165 -->
<!-- tdd: off -->
# 릴리스 페이지(GitHub) 링크 열기: 설정 버튼과 액션 (이슈 #70)

## 목표 / 비목표
- 목표: `https://github.com/gyuha/twin-deck/releases`를 OS 기본 브라우저로 여는 기능을 더한다. 진입점은 설정 화면 위쪽 `업데이트 확인` 옆의 `변경 사항`(영어 `Release notes`) 버튼과 액션 패널의 새 액션 `core.app.releases`(기본 단축키 없음, 제목 "릴리스 노트 열기"/영어 "Open release notes")다.
- 구현: `apps/desktop/src-tauri/src/service.rs`에 `td_launch::Launch<L>`을 받는 `open_releases_page`(`reveal_config` 등과 같은 모양)를 두고 주소는 Rust 상수 `RELEASES_URL` 한 곳에서 정해 `launch.open(RELEASES_URL)`로 연다(`td-launch`의 `open_command`가 macOS `open`·Windows `explorer`·Linux `xdg-open`을 쓴다). `commands.rs`에 인수 없는 `#[tauri::command] #[specta::specta] open_releases_page`를 더해 명령 목록에 등록한다. 임의 URL을 받는 명령은 만들지 않는다.
- 비목표: 앱 안에서 변경 사항 렌더링, 업데이트 확인 창 변경, 자동 확인, 새 단축키, 새 플러그인 의존성, `CHANGELOG.md`·버전.

## 진실의 원천
- 용어: 없음. 관련 ADR: 없음.
- 연결 체인(AGENTS.md "Backend 기능 추가"): Rust 명령 → `task gen-types`(바인딩) → `packages/ts-client/src/backend.ts`의 `openReleasesPage(): Promise<void>` → `tauri.ts` → `fake.ts`(`openedUrls: string[]`에 주소를 기록) → 스토어 api → 설정 버튼·액션 핸들러.
- 정의 완료(DoD):
  1. `cargo test -p twin-deck-desktop open_releases`가 1건 이상 통과(작성 시점 0건 → 앞으로 향하는 확인). 기록용 가짜 `Launcher`(`reveal_config` 테스트의 `Rec` 모양)로 macOS·Windows·Linux 각각에서 실행된 명령의 프로그램(`open`·`explorer`·`xdg-open`)과 인수(정확히 `https://github.com/gyuha/twin-deck/releases` 하나)를 단언한다.
  2. `cd apps/desktop && bunx vitest run src/__tests__/releases-link.test.tsx` 통과(작성 시점 파일 없음 → 앞으로 향하는 확인): (a) 설정 화면 위쪽 `변경 사항` 버튼이 `업데이트 확인` 옆에 있고 누르면 `backend.openedUrls`가 `["https://github.com/gyuha/twin-deck/releases"]`, (b) 액션 패널에서 `core.app.releases` 실행도 같은 기록, (c) 영어에서 버튼 이름 `Release notes`, (d) 이 액션에 기본 단축키가 없음.
  3. `grep -c openReleasesPage packages/ts-client/src/generated/bindings.ts` ≥ 1(작성 시점 0), `cargo test -p twin-deck-desktop up_to_date` 통과(작성 시점에 통과 중인 회귀 방어; 바인딩을 다시 만든 뒤에도 통과해야 한다).
  4. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 전체 통과, `cd packages/actions && bunx vitest run` 통과(작성 시점에 통과 중인 회귀 방어; `i18n-keys`·`settings`·액션 목록 테스트 포함, 병렬 간헐 실패는 단독 재실행으로 통과하면 인정).
  5. `cargo clippy -p twin-deck-desktop -- -D warnings`와 `cargo fmt --check` 통과(작성 시점에 통과 중인 회귀 방어; AGENTS.md: `--all-targets`가 아니라 이 명령이 관문).
  6. `grep -c 'core.app.releases' docs/05-actions-keybindings.md` ≥ 1, `grep -c '\*\*변경 사항\*\*' README.md` ≥ 1, `grep -c 'Release notes' README.en.md` ≥ 1(작성 시점 0·0·0 → 앞으로 향하는 확인). README는 "업데이트" 절(66행 부근)에 새 버튼을 한 줄 더하고 README.en.md에 같은 내용을 쓴다.
  - 이 DoD는 실제로 브라우저가 열리는지(특히 Windows `explorer <URL>`, Linux `xdg-open`)를 증명하지 못한다. 사람이 앱에서 눌러 확인해야 한다.

## 작업 조각
- [ ] S1. Rust: `service.rs`에 `RELEASES_URL`·`open_releases_page`와 가짜 실행기 테스트(`open_releases_*`), `commands.rs`에 명령을 더해 목록에 등록하고 `task gen-types`로 바인딩·기본 설정 fixture를 다시 만든다. — 완료 기준: DoD 1·3·5.
- [ ] S2. 브리지·UI: `backend.ts`·`tauri.ts`·`fake.ts`에 `openReleasesPage`를 더하고, 스토어 api, `packages/actions/src/defaults.ts`의 액션 메타(`core.app.releases`, 기본 키 없음)와 `actions.ts` 핸들러, `ui/Settings.tsx` 위쪽 버튼, ko/en 문구(`settings.releases`·`action.core.app.releases`)를 더하고 `releases-link.test.tsx`를 쓴다. — 완료 기준: DoD 2·4. (depends: S1)
- [ ] S3. 문서: `docs/05-actions-keybindings.md`에 액션 행, `README.md`·`README.en.md` 업데이트 절에 버튼 한 줄. 전체 검증을 돌린다. — 완료 기준: DoD 4·5·6. (depends: S2)
