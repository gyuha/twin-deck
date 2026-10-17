# RUN — 끊긴 원격 탭에 재연결 버튼과 상태 메시지를 보인다 (이슈 #98 ②)

워크플로 없이 직접 실행했다(변경이 작다).

## 슬라이스 결과
- S1 `FakeBackend.simulateRemoteDrop(id)` — ✅ as planned. 그 연결의 `listDir`·`fileInfo`가 "원격 연결이 끊어졌습니다"로 실패하고, 같은 서버에 `remoteConnect`가 다시 성공하면 풀린다. `Backend` 인터페이스는 안 바꿨다.
- S2 `isRemoteDisconnected` — ⚠ 위치 보정: 처음엔 `lib/remoteErrors.ts`에 한글 문구를 직접 뒀으나 "코드 안 한글 허용 목록" 가드(`i18n-no-hardcoded`)에 걸려, 문구 목록(`RUST_REMOTE_DISCONNECTED`)을 `i18n/rust.ts`로 옮기고 `lib/remoteErrors.ts`가 그것을 쓰게 했다.
- S3 `store.ts` — ✅ as planned. 접속·비밀번호·호스트 키 흐름을 `openRemoteConnection(index)`로 빼 `connectRemote`가 쓰게 했고(기존 동작 불변), `reconnectRemote`를 더했다: 탭의 연결 id로 설정 서버 항목을 찾고(`remoteIndexOf`), 같은 흐름으로 접속한 뒤 그 연결을 보는 모든 탭을 다시 읽는다.
- S4 오버레이 — ✅ as planned. `FileTable`이 끊긴 원격 탭에 `data-remote-disconnected` 오버레이(안내·연결 id·오류 문구·"다시 연결")를 그리고 목록을 `data-dimmed`·`opacity-30`으로 흐리게 한다. 영어 UI에서는 오류 문구를 `rustText`로 번역해 보인다. 끊김일 때는 기존 오류 줄을 숨긴다(오버레이가 문구를 담는다).
- S5 액션 `core.remote.reconnect` — ✅ as planned (`ActionContext.remoteDisconnected`, 기본 단축키 없음).
- S6 시험 10개 + 문서 — ✅ as planned (계획의 여덟 + 문구 목록·대응표 일치 시험 1 + 빈 상태의 액션 비실행을 (g)에 포함해 9→10).

## DoD baseline → after
1. `remote-reconnect.test.tsx` — 파일 없음(실패) → 10개 통과
2. 기존 원격 시험 `remote-panel`·`remote-terminal`·`drive-bar` — 57개 통과 → 57개 통과 (수정 없이)
3. `bun run test` — desktop 1492 통과 → 1502 통과, 실패 0 (회귀 가드)
4. `tsc --noEmit` — 통과 → 통과 (회귀 가드)
5. 범위 — Rust 허용 파일 밖 0 · 생성 바인딩/`backend.ts`/`tauri.ts` 0 · 의존성·락 파일 0 (회귀 가드). `cargo test -p twin-deck-desktop up_to_date`도 통과(생성 바인딩 낡지 않음).
6. 문서 grep 다섯 모두 0 → 모두 1

## 계획 밖 보정·발견
- ① 전체 시험에서 가드 2개가 걸렸다: `i18n-rust-messages`(새 Rust 문구 "원격 연결이 끊어졌습니다"가 번역 대응표에 없음) → `i18n/rust.ts`에 영어("The remote connection was lost")와 함께 추가, `i18n-no-hardcoded`(코드 안 한글이 있는 파일 목록은 비어 있어야 함) → 위 S2 보정.
- ② 변형 확인(빨강): 오버레이를 렌더하지 않게 하면 10개 중 8개가 실패하고, 액션을 항상 실행 가능하게 하면 (g)가 실패한다. 둘 다 원복했다.
- ③ `reconnectRemote`는 끊긴 탭이 아니어도 원격 탭이면 같은 일을 한다(액션은 끊긴 탭일 때만 노출되고 버튼은 오버레이에만 있어 실제로는 끊긴 탭에서만 불린다).

## 한계
- 끊김은 그 탭을 다시 읽을 때(폴더 이동·파일 작업) 알게 된다. 새로고침 액션이 없어서 조용히 끊긴 채 가만히 두면 오버레이가 뜨지 않는다. 자동 재연결·하트비트는 없다(범위 밖).
- 원격 터미널 탭은 이 오버레이 대상이 아니다.
- `FakeBackend`와 jsdom으로만 검증했다. 실제 앱 창(WKWebView)에서 오버레이 모양·위치와 실제 SFTP 서버를 끊었다가 다시 연결하는 전 과정은 확인하지 못했다. Rust 쪽(죽은 세션 교체)은 실서버 시험(`FakeSftp`)으로 확인했지만 UI와 이어서 돌린 시험은 없다.
- 영어 UI의 일부 오류 줄은 기존대로 번역 없이 한국어 원문으로 보일 수 있다(오버레이만 `rustText`로 번역).
