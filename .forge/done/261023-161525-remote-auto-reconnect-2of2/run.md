# 실행 기록 — 끊긴 원격 탭 자동 재연결 옵션 (#204, 이슈 #108)

워크플로 없이 메인 세션이 직접 실행(fg-loop 드라이브).

## 작업 단위별 결과
- S1 `remote.auto_reconnect`(기본 true) 설정 키 + gen-types + SFTP·FTP 서버 탭 스위치 + ko·en — ✅ 계획대로
- S2 `openRemoteConnection(index, silent)` + `autoReconnect(id)`(연결 id별 진행 중 시도 공유, 실패한 끊김은 `autoReconnectSpent`로 다시 시도 안 함, 연결 성공 시 풀림) + `reload`의 끊김 오류에서 한 번 자동 시도 — ✅ 계획대로
- S3 문서(docs/06 `[remote] auto_reconnect`, README 한·영 끊김 설명) — ✅ 계획대로

## 계획과 달라진 점
- `RemoteConfig`에 필드가 늘어 시험 18곳의 `remote = { servers }` 리터럴에 `auto_reconnect: true`를 넣었고, `FakeBackend.setRemoteServers`가 다른 remote 설정을 지우지 않게 고쳤다.
- 수동 다시 연결 시험(remote-reconnect.test.tsx)은 저장된 비밀번호를 쓰므로 자동 재연결이 먼저 붙어 버린다. 이 파일은 `auto_reconnect = false`로 수동 흐름만 시험한다.
- 터미널 탭 시험은 처음에 실제 터미널을 열지 않아 약했다 → 원격 셸 탭을 열고 끊은 뒤 자동 시도가 없는지 보는 시험으로 바꿨다.
- 시험이 실제로 동작을 잡는지 확인: "한 번만 시도" 조건을 지우면 ⑥이, silent 분기를 끄면 ③④⑥과 재시도 시험이 실패했다.

## DoD 기준값 → 실행 후
- C4 remote-auto-reconnect 시험: 없음 → 8개 통과(① 다시 붙고 다른 패널 탭도 원래 경로 ② 꺼짐이면 버튼 ③ 비밀번호 없음 → 창 없이 버튼 ④ 호스트 키 확인 → 창 없이 버튼 ⑤ 터미널 제외 ⑥ 한 번만 + 수동 성공 뒤 다시 자동 + 설정 스위치)
- C5 default.toml `auto_reconnect = true` 1, up_to_date 통과, 스위치 시험 통과
- C6 td-remote·td-archive·td-config 시험, desktop 165 통과(coalesce 제외), clippy, typecheck, bun run test 1585 통과, gen-licenses --check 통과
