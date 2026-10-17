# RUN — 끊긴 원격 세션을 다시 연결하면 새 세션으로 바꿔 끼운다 (이슈 #98 ①)

워크플로 없이 직접 실행했다(변경이 작다).

## 슬라이스 결과
- S1 `RemoteSession::is_alive`(기본 `true`) + `SftpSession`이 `!handle.is_closed()`로 구현 — ✅ as planned (`_handle` 필드명의 밑줄 접두사는 이제 쓰여서 `handle`로 고침)
- S2 `RemoteRegistry::session()`이 끊긴 세션에 `REMOTE_DISCONNECTED`("원격 연결이 끊어졌습니다")로 실패 — ✅ as planned. 상수를 `td-archive` 한 곳에 두고 `lib.rs`에서 재내보냈다.
- S3 `service::connect_remote`가 `is_alive()`와 `home()`으로 살아 있는지 확인하고, 아니면 레지스트리에서 버린 뒤 새로 접속 — ✅ as planned (시작 폴더가 있어도 확인한다)
- S4 시험 6개 — ✅ as planned. 새 시험: td-remote 1(실서버), td-archive 2, 앱 3(`each`로 FTP·SFTP 둘 다).

## DoD baseline → after
1. "재연결" 시험 통과 합 — 1(기존 호스트 키 시험 하나) → 7, 실패 0. **계약의 "사전 0개"는 오기였다**: 기존 시험 하나가 이름에 "재연결"을 갖고 있어 사전 1개였고, 기준을 합 6 이상(새 시험 5개 이상)으로 바로잡았다. 새 시험은 6개다.
2. 기존 원격 시험 — `td-remote`·`td-archive` 실패 0(105개), 앱 `remote` 필터 36 → 39(새 3개 포함), 실패 0 (회귀 가드)
3. `fmt --check` 0, `clippy -D warnings` 0 (회귀 가드)
4. TS·생성 바인딩 diff 0, 의존성 추가 0 (회귀 가드)

## 계획 밖 보정·발견
- ① 수정 전 코드로 되돌리면 앱 시험 3개가 모두 "죽은 세션을 재사용했다"로 실패한다(빨강 확인 후 원복). 시작 폴더가 있는 경우(죽은 세션의 경로를 그대로 "연결됨"으로 돌려주던 쪽)도 같이 재현된다.
- ② 루프 계약의 범위 가드(C8)에서 `crates/td-archive/src/lib.rs`(재내보내기 한 줄)와 두 크레이트의 `tests/*.rs`가 허용 목록에서 빠져 있었다. 계획 구현 중 필요해져 계약(loop.md의 C8 정규식·허용 파일 목록, 계획 2의 DoD 5)을 사실에 맞게 넓혔다.
- ③ 실서버 시험(e): `FakeSftp`를 `drop`하면 실제 `SftpSession`의 `is_alive()`가 5초 안에 거짓이 되고 `home()`이 오류가 되는 것을 확인했다(russh `Handle::is_closed`가 서버 종료를 알아챈다).

## 한계
- `Handle::is_closed()`는 연결 작업이 끝난 것을 알려 준다. 네트워크가 소리 없이 끊겨(패킷 유실, FIN 없음) 연결 작업이 아직 끝나지 않은 상태는 `is_alive()`가 참일 수 있다. 그 경우 `connect_remote`의 `home()` 확인이 시간 초과(`Unreachable`)로 잡아 교체하지만, 그 전까지 목록 읽기는 시간 초과 오류로 실패한다(안정된 "끊어졌습니다" 문구가 아니라 "서버에 연결할 수 없습니다"). UI는 두 문구를 모두 끊김으로 본다(계획 2).
- 작업 도중에 끊긴 한 번의 오류는 raw 문구로 나올 수 있다(그다음 접근부터 안정된 문구).
- `remote_connections`는 여전히 죽은 세션을 "연결됨"으로 센다(범위 밖).
- FTP는 `is_alive` 기본값 `true`다(제어 연결이 끊기면 `with_ctrl`이 한 번 다시 연결한다).
