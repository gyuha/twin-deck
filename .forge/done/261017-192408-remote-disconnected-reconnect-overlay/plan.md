<!-- forge-slug: remote-disconnected-reconnect-overlay -->
<!-- task: 197 -->
<!-- tdd: off -->
# 끊긴 원격 탭에 재연결 버튼과 상태 메시지를 보인다 (이슈 #98 ②)

## Goal / Non-goals
- Goal: 원격(SFTP·FTP) 탭이 끊김("원격 연결이 끊어졌습니다"·"원격 연결이 열려 있지 않습니다"·"서버에 연결할 수 없습니다")으로 목록을 못 읽으면 그 패널을 **흐리게(dim)** 하고 가운데에 상태 메시지와 **"다시 연결" 버튼**을 보인다. 누르면 기존 연결 흐름(저장된 비밀번호 → 없거나 틀리면 비밀번호 창, 호스트 키 확인)으로 다시 접속하고, 성공하면 그 연결을 보는 **모든 탭**(양쪽 패널·배경 탭)을 다시 읽어 복구한다. 연결하는 동안은 버튼이 꺼지고 "연결하는 중…"으로 바뀐다. 취소·실패하면 오버레이가 남고 알림이 보인다. 키보드로도 되도록 액션 패널(`Mod+Shift+P`)에 **`core.remote.reconnect`("원격 다시 연결")** 액션을 더한다(기본 단축키 없음, 끊긴 탭일 때만 실행 가능). 이미 있는 Rust 쪽 `remote_connect`가 죽은 세션을 바꿔 끼우게 되므로(plan `remote-reconnect-stale-session`) 새 Backend 명령은 필요 없다.
- Non-goals: Rust·Tauri 명령·`Backend` 인터페이스(`backend.ts`·`tauri.ts`)·생성 바인딩 변경. 자동 재연결·하트비트·끊김 즉시 감지(목록을 다시 읽을 때 알게 된다). 원격 터미널 탭의 재연결. 설정에서 지워진 서버의 재연결(알림만 보인다). 기본 단축키 지정. 새 의존성.

## Source of truth
- Glossary terms: none
- Related ADRs: none (`docs/07-ui-spec.md`, `docs/05-actions-keybindings.md`, store의 `connectRemote`·`disconnectRemote`)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/remote-reconnect.test.tsx` 종료 코드 0, 테스트 8개 이상 통과 (파일이 없는 지금은 실패 — 앞으로 가야 할 검사). 시험은 `FakeBackend`에 끊김 흉내(`simulateRemoteDrop(연결 id)`: 그 연결의 목록·읽기가 "원격 연결이 끊어졌습니다"로 실패, `remoteConnect`가 다시 성공하면 풀림)를 더해 쓰고, 최소 이 여덟을 단언한다: (a) 끊긴 뒤 활성 원격 탭을 다시 읽으면 패널에 오버레이(메시지 + "다시 연결" 버튼)가 뜨고 목록 영역이 흐려진다(`aria-hidden` 또는 `data-dimmed`) (b) "다시 연결"을 누르면 `remoteConnect`가 다시 불리고, 저장된 비밀번호가 없으면 비밀번호 창이 뜨며, 맞게 입력하면 오버레이가 사라지고 목록이 복구된다 (c) 연결하는 동안 버튼이 비활성이고 "연결하는 중…"이다(지연시킨 `remoteConnect`) (d) 비밀번호 창을 취소하면 오버레이가 남는다 (e) 같은 연결을 보는 다른 탭(반대편 패널의 탭)도 함께 복구된다 (f) 끊김이 아닌 오류(예: "권한 없음")는 오버레이를 띄우지 않고 기존 오류 줄만 보인다 (g) 액션 패널에서 `core.remote.reconnect`("원격 다시 연결")는 끊긴 탭일 때만 실행 가능하고 실행하면 (b)처럼 다시 연결한다 (h) 설정에서 지워진 서버의 탭이면 다시 연결하지 않고 알림을 보이며 오버레이가 남는다.
  2. 기존 원격 관련 시험이 수정 없이 통과한다: `cd apps/desktop && bunx vitest run src/__tests__/remote-panel.test.tsx src/__tests__/remote-terminal.test.tsx src/__tests__/drive-bar.test.tsx` 종료 코드 0 (회귀 가드: 지금 통과한다).
  3. 저장소 루트에서 `bun run test` 종료 코드 0, desktop 통과 수가 **1492 이상** (회귀 가드: 지금 1492 통과·1 skipped — i18n 짝·액션 키 충돌 시험 포함).
  4. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 가드).
  5. 범위(회귀 가드, 지금도 충족): `git diff --name-only ef70ff6 -- crates apps/desktop/src-tauri | grep -vxE 'crates/td-remote/src/(lib|sftp)\.rs|crates/td-archive/src/(lib|remote_fs)\.rs|crates/(td-remote|td-archive)/tests/[^/]+\.rs|apps/desktop/src-tauri/src/service\.rs'` 출력이 비어 있다(Rust는 plan `remote-reconnect-stale-session`이 건드리는 파일(td-remote `lib.rs`·`sftp.rs`, td-archive `lib.rs`·`remote_fs.rs`, 두 크레이트의 `tests/*.rs`, 앱 `service.rs`) 밖은 불변), `git diff --name-only ef70ff6 -- packages/ts-client/src/generated packages/ts-client/src/backend.ts packages/ts-client/src/tauri.ts` 출력이 비어 있다(생성 바인딩·`Backend` 인터페이스 불변), `git diff ef70ff6 -- package.json apps/desktop/package.json bun.lock Cargo.lock`이 비어 있다(새 의존성 없음).
  6. 문서(사전 상태는 모두 0): `grep -c "core.remote.reconnect" docs/05-actions-keybindings.md` ≥ 1, `grep -c "core.remote.reconnect" packages/actions/src/defaults.ts` ≥ 1, `grep -c "연결이 끊어" docs/07-ui-spec.md` ≥ 1, `grep -c "다시 연결" README.md` ≥ 1, `grep -ci "reconnect" README.en.md` ≥ 1. README 한·영은 한 쌍이라 함께 고친다.

## Work slices
- [ ] S1. `packages/ts-client/src/fake.ts`: 끊김 흉내 `simulateRemoteDrop(id)`를 더한다 — 그 연결의 `listDir`·읽기류는 "원격 연결이 끊어졌습니다"로 실패하고, `remoteConnect`가 그 연결로 다시 성공하면 끊김이 풀린다(Rust 동작과 같게). `Backend` 인터페이스는 바꾸지 않는다 — completion criterion: DoD 1의 (a)(b)가 이 흉내로 동작하고 DoD 5가 충족된다
- [ ] S2. `lib/remoteErrors.ts`(또는 비슷한 위치)에 `isRemoteDisconnected(message)`: 세 문구("원격 연결이 끊어졌습니다"·"원격 연결이 열려 있지 않습니다"·"서버에 연결할 수 없습니다")로 끊김을 알아본다. 영어 UI 문구(`i18n/rust.ts`의 번역)도 있으면 함께 본다 — completion criterion: DoD 1의 (a)(f)
- [ ] S3. `store.ts`: `connectRemote`의 접속·비밀번호·호스트 키 흐름을 `index`로 접속하고 루트를 돌려주는 안쪽 함수로 나눠 `connectRemote`가 그것을 쓰게 하고(기존 동작 불변), `reconnectRemote(pane?, tabId?)`를 더한다: 탭 경로의 연결 id로 설정 서버 항목을 찾아(없으면 알림) 같은 흐름으로 접속한 뒤 그 연결을 보는 모든 탭(양쪽 패널·배경 탭)을 다시 읽는다. 연결 중 상태는 기존 `remoteConnecting`을 쓴다 — completion criterion: DoD 1의 (b)(c)(d)(e)(h), DoD 2
  (depends: S1, S2)
- [ ] S4. 오버레이: 활성 원격 탭이 끊김이면 `FileTable`(또는 `Pane`)이 목록 영역을 흐리게(`aria-hidden`/`data-dimmed`, 포인터·키 입력 차단) 하고 가운데에 상태 메시지(끊김 안내 + 연결 id + 서버가 준 오류 문구)와 "다시 연결" 버튼(연결 중이면 비활성 + "연결하는 중…")을 그린다. i18n ko·en — completion criterion: DoD 1의 (a)(c)(f)
  (depends: S3)
- [ ] S5. 액션 `core.remote.reconnect`("원격 다시 연결", scope pane, 끊긴 탭일 때만 `isApplicable`, 기본 단축키 없음): `ActionContext`에 `remoteDisconnected?: boolean`을 더하고 store가 채우며, `actions.ts`에 핸들러를 잇는다. i18n ko·en — completion criterion: DoD 1의 (g)
  (depends: S3)
- [ ] S6. 시험 `remote-reconnect.test.tsx`에 DoD 1의 여덟 시험을 쓰고, 문서(`docs/05` 행, `docs/07` 오버레이 설명, README 한·영)를 맞춘다 — completion criterion: DoD 1, DoD 6
  (depends: S4, S5)
