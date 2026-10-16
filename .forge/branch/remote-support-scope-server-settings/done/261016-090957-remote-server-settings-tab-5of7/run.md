# run — 설정 "연결 > Twin Deck Remote" 탭 (5/7)

general-purpose 에이전트에 위임해 구현하고, 핵심 검증은 직접 다시 돌렸다.

- S1 서버 영역 UI와 backend 연결 — ✅ 켜기·끄기, bind·포트·루트·사용자, 쓰기·셸 허용, 비밀번호(입력창 `type=password`, 보낸 뒤 비움), 접속 주소·지문 표시. 비밀번호·루트가 비면 UI에서 스위치를 막고 이유를 보인다
- S2 접속 주소 목록·편집, `twindeck` 프로토콜 — ✅ `RemoteServersControl`에 `protocols`·`addProtocol` props로 일반화. SFTP·FTP 탭과 서로의 항목을 보존한다. 연결 경로는 이미 ftp 외에는 모두 SFTP로 연결하므로 바꾸지 않았다(경로 표기는 `sftp://`)
- S3 탭 등록 — ✅ `TWIN_DECK_REMOTE_SECTION`, 연결 그룹 count 3, i18n ko·en, settings 탭 목록 테스트 11개로 갱신

DoD baseline → after:
- `twin-deck-remote.test.tsx` : 0개 → 15 passed. settings.test.tsx 포함 62 passed (직접 재실행)
- vitest 전체 : 1378 → 1393 passed(에이전트 보고). tsc·fmt·`up_to_date`(2)·clippy 통과(직접 확인: tsc·fmt·up_to_date)

계획 밖 결정·한계:
- 스위치를 켜고 끌 때 설정 `remote_server.enabled`도 같이 바꾼다(요청 밖 추가, 이 키가 앱 시작 때만 읽혀서 안 바꾸면 다음 실행에 꺼진다).
- 서버가 켜진 뒤 설정을 바꾸면 자동 재시작 없이 "껐다 다시 켜야 적용" 안내만 보인다.
- 실제 앱 화면(레이아웃, 긴 탭, 목록 최소 높이)은 눈으로 확인하지 못했다. 렌더링 테스트(FakeBackend)만 통과했다.
- 드라이브 바 연결 메뉴의 "SFTP·FTP 관리…"는 twindeck 탭이 아니라 SFTP·FTP 탭을 연다. 드라이브 바 항목 이름은 `TWINDECK · 이름`.
