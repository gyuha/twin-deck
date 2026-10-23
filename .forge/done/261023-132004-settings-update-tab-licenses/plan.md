<!-- forge-slug: settings-update-tab-licenses -->
<!-- task: 202 -->
<!-- tdd: off -->
# 설정 시스템 그룹에 업데이트 탭과 오픈소스 라이선스 고지를 더하고, 상단 버튼을 탭 안으로 옮긴다

## 목표 / 하지 않는 것
- 목표:
  - 설정 > 시스템 그룹의 `환경` 아래에 `업데이트` 탭을 만든다. 탭에는 현재 버전, 변경 사항, 확인 상태와 `지금 확인`, 설치, `오픈소스 라이선스…`를 둔다.
  - 상단 헤더에는 `닫기 Esc`만 남긴다.
  - `설정 폴더 열기`는 환경 탭의 `설정 저장 경로` 줄로 옮긴다.
  - 사용하는 오픈소스의 이름·버전·라이선스 목록을 텍스트로 앱 안에서 고지한다.
- 하지 않는 것:
  - **라이선스 원문(LICENSE/COPYING 본문)은 넣지 않는다.** 이름·버전·라이선스 표만 둔다. MIT·Apache-2.0 등이 요구하는 원문 동봉 의무는 이번 범위에서 채우지 않는다(사용자 결정, 알려진 한계). 원문은 나중에 같은 생성 스크립트를 넓혀 추가할 수 있다.
  - 자동 업데이트 확인(주기적 확인)은 하지 않는다. 확인은 지금처럼 수동으로만 한다.
  - 작업 큐가 진행 중일 때 설치를 경고하는 기능은 넣지 않는다.
  - `THIRD_PARTY_NOTICES.md`의 내용은 고치지 않는다(고지 끝에 원문 그대로 덧붙이기만 한다).

## 기준 자료
- 용어집: 없음
- 관련 ADR: 없음
- 결정 사항(그릴링 합의):
  1. 업데이트 확인 결과는 **탭 안에서** 보여 준다. 설정을 닫지 않는다. 상태 줄은 `아직 확인하지 않음 → 확인 중… → 최신 버전입니다 / 새 버전 X.Y.Z가 있습니다 / 오류`로 바뀐다. 새 버전이 있으면 노트와 `설치하고 다시 시작` 버튼을 보여 준다.
  2. `변경 사항`(릴리스 페이지 열기, 이슈 #70)은 업데이트 탭의 `현재 버전` 줄로 옮긴다. 헤더에는 `닫기`만 남는다.
  3. `설정 폴더 열기`는 환경 탭의 `설정 저장 경로` 줄에 버튼으로 붙인다(`[폴더 열기] [경로 바꾸기…]`). `reveal_config_dir`는 사용자가 바꾼 경로를 따라가므로 이 줄과 대상이 같다.
  4. 고지는 **이름·버전·라이선스 표**로 한다. 범위는 `twin-deck-desktop` crate의 정상·빌드 의존 트리와 `apps/desktop`의 `dependencies` 트리다. 작업공간 자체 crate(`td-*`)와 devDependencies는 넣지 않는다. 표 뒤에 `THIRD_PARTY_NOTICES.md`를 원문 그대로 덧붙인다.
  5. 고지 파일은 `scripts/gen-licenses.mjs`가 `apps/desktop/src/generated/licenses.txt`로 만들고 커밋한다. `task gen-types`가 이 스크립트를 함께 실행하고, `task check`는 `--check`로 실행해 파일이 오래됐으면 실패한다.
  6. `오픈소스 라이선스…`는 **앱 창 전체를 덮는 모달**로 보여 준다(`ServerModal`과 같은 방식: `fixed inset-0 z-50`, 키 입력이 바깥으로 새지 않게 막음, Esc·바깥 클릭·닫기로 닫음, 창의 대부분을 차지하는 크기, 고정폭 글꼴, 스크롤 가능, 텍스트 선택 가능). Esc로 모달만 닫히고 설정은 남는다.
  7. `설치하고 다시 시작`을 누르면 **확인 모달**(위와 같은 방식)을 한 번 띄운 뒤 설치한다. 설치 중에는 버튼을 비활성화한다.
  8. 액션 `core.app.check_update`는 설정의 업데이트 탭을 열고 바로 확인을 시작한다. 옛 flash·confirm 흐름(`checkForUpdate`의 현재 본문)은 지우고 경로를 하나로 합친다. 동작이 바뀌므로 다음 CHANGELOG에 `### 변경`으로 적을 대상이다(이번 작업에서 버전을 올리지는 않는다).
- 구현 메모:
  - 현재 버전은 Backend에 `appVersion()`을 더해 읽는다. Tauri 쪽은 `@tauri-apps/api/app`의 `getVersion`, Fake 쪽은 고정값을 쓴다. `backend.ts` → `tauri.ts` → `fake.ts` 순서로 체인을 따른다.
  - `SECTION_GROUPS`의 system `count`는 1에서 2로 바뀌고 SECTIONS 합은 11에서 12로 바뀐다. 업데이트 탭을 환경 바로 뒤에 넣기 때문에 그 뒤 연결 탭의 번호(`SMB_SECTION` 등)가 하나씩 밀린다. 상수로 참조하는 곳은 그대로 동작하지만, 저장된 `settingsSection` 번호가 있으면 확인한다.
  - i18n은 ko·en을 함께 고친다. 안 쓰게 된 `settings.update`·`settings.open_config_dir`·`store.update.*` 키는 정리한다.
  - `docs/05-actions-keybindings.md`의 `core.app.check_update` 설명이 있으면 새 동작으로 고친다.
- 완료 정의(DoD):
  1. `node scripts/gen-licenses.mjs --check`가 종료 코드 0으로 끝난다. 의존성 버전을 하나 바꾸거나 `licenses.txt`에서 한 줄을 지우면 0이 아닌 코드로 끝난다(검증 후 되돌린다).
     - 작성 시점 상태: 스크립트가 없다(새로 만드는 항목이라 정상).
  2. `licenses.txt`에 `react`, `zustand`, `@xterm/xterm`, `tauri`, `zip`의 `이름 버전 라이선스` 줄이 있고, `td-vfs`는 없으며, `THIRD_PARTY_NOTICES.md` 본문이 덧붙어 있다.
     - 확인 명령: `grep -cE '^(react|zustand|@xterm/xterm|tauri|zip) ' apps/desktop/src/generated/licenses.txt` → 5 이상, `grep -c '^td-vfs ' …` → 0, `grep -c 'Third-party notices' …` → 1 이상.
     - 작성 시점 상태: 파일이 없다(새로 만드는 항목이라 정상).
  3. `Settings.tsx` 헤더에 `업데이트 확인`·`변경 사항`·`설정 폴더 열기` 버튼이 없다. 해당 줄을 vitest가 확인한다.
  4. vitest가 다음을 확인한다(새 테스트 또는 기존 `settings.test.tsx` 확장):
     - 시스템 그룹에 `환경`·`업데이트` 두 탭이 있고 SECTIONS 합이 12다.
     - 업데이트 탭에 현재 버전이 표시된다.
     - `지금 확인`을 누르면 FakeBackend 결과에 따라 상태가 `최신 버전입니다` 또는 `새 버전 X가 있습니다`(노트와 설치 버튼 포함)로 바뀐다. 오류도 상태 줄에 나온다.
     - 설치 버튼을 누르면 확인 모달이 뜨고, 확인을 눌렀을 때만 `installUpdate`가 불린다.
     - `오픈소스 라이선스…`를 누르면 모달이 뜨고, Esc를 누르면 모달만 닫히고 설정은 열린 채 남는다.
     - 환경 탭의 `설정 저장 경로` 줄에 `폴더 열기` 버튼이 있고, 누르면 `revealConfigDir`가 불린다.
     - `core.app.check_update` 액션을 실행하면 설정이 업데이트 탭으로 열리고 확인이 시작된다.
     - 작성 시점 상태: `settings.test.tsx:64`가 합 11을 기대하고 있다(새 기대값으로 바꿀 대상).
  5. `cd apps/desktop && bunx tsc --noEmit` 통과, `bun run test` 전체 통과.
  6. `cargo test -p twin-deck-desktop up_to_date`가 통과한다(Rust 명령을 더하지 않으면 회귀 방지 확인이다).
  7. 실제 앱(격리 실행)에서 업데이트 탭, 라이선스 모달, 설치 확인 모달이 이미지 레이아웃대로 보이는지 눈으로 확인한다(UAT, WKWebView는 테스트로 확인하지 못함).

## 작업 단위
- [ ] S1. `scripts/gen-licenses.mjs` 작성(`cargo metadata` + `bun.lock`/`node_modules` → `licenses.txt`, `--check` 모드), `Taskfile.yml`의 `gen-types`·`check`에 연결(`justfile` 미러도 맞춤), 생성 파일 커밋 — 완료 기준: DoD 1·2 통과
- [ ] S2. Backend에 `appVersion()` 추가(backend.ts·tauri.ts·fake.ts), store에 업데이트 상태(`idle|checking|latest|available(info)|error`)와 확인·설치 메서드 정리, `core.app.check_update`를 "업데이트 탭 열기 + 확인"으로 변경 — 완료 기준: 액션 실행 시 `settingsOpen`이 켜지고 업데이트 탭 번호가 선택되며 상태가 `checking`을 거쳐 결과로 바뀌는 vitest 통과
- [ ] S3. Settings UI: 업데이트 탭(현재 버전 + `변경 사항`, 상태 줄 + `지금 확인`, 노트 + `설치하고 다시 시작` → 확인 모달, `오픈소스 라이선스…` → 전체 창 모달), 환경 탭 `설정 저장 경로` 줄에 `폴더 열기`, 헤더 버튼 정리, `SECTION_GROUPS` 갱신, ko·en i18n — 완료 기준: DoD 3·4·5 통과 (의존: S1, S2)
- [ ] S4. `docs/05-actions-keybindings.md`의 `core.app.check_update` 설명 갱신(있을 경우)과 격리 앱 UAT — 완료 기준: DoD 6·7 (의존: S3)
