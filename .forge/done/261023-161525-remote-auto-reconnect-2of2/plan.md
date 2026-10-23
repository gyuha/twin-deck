<!-- forge-slug: remote-auto-reconnect-2of2 -->
<!-- task: 204 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# 끊긴 원격 탭을 묻지 않고 한 번 자동 재연결하는 옵션(`remote.auto_reconnect`, 기본 켜짐)을 더한다 (이슈 #108)

## 목표 / 하지 않는 것
- 목표: 원격 파일 탭에서 작업이 "끊김"(REMOTE_DISCONNECTED)으로 실패하면, `remote.auto_reconnect`가 켜져 있을 때 창을 띄우지 않고 한 번 다시 접속한다(저장된 비밀번호 + 이미 신뢰한 호스트 키일 때만). 성공하면 그 서버를 보는 모든 탭을 원래 경로로 다시 읽고, 실패·비밀번호 없음·호스트 키 확인 필요면 기존 "다시 연결" 버튼을 보인다.
- 하지 않는 것: 원격 터미널 탭 자동 재연결, 백그라운드 재시도, 여러 번 재시도(끊김 한 번에 자동 시도 한 번).

## 기준 자료
- 용어집: 없음 · 관련 ADR: 없음
- 기존 흐름: `store.ts`의 `openRemoteConnection`(저장된 비밀번호 → 비밀번호 창·호스트 키 창), `reconnectRemote`(성공 시 같은 연결의 모든 탭 reload), `isRemoteDisconnected`.
- 설정 키 체크리스트(AGENTS.md): td-config 구조체 + default.toml → `task gen-types` → `ui/Settings.tsx` SFTP·FTP 서버 탭 → 설정 탭 시험. ko·en i18n.
- 완료 정의(DoD): loop.md C4·C5·C6 통과. 문서: docs/06(설정 키)·07(UI), README 한·영의 원격 연결 설명이 있으면 맞춘다.

## 작업 단위
- [ ] S1. `remote.auto_reconnect`(bool, 기본 true) 설정 키 + gen-types + 설정 화면 스위치 + i18n — 완료 기준: C5
- [ ] S2. 묻지 않는 연결 경로(`openRemoteConnection`의 silent 모드: 창이 필요하면 null) + 끊김 오류에서 한 번 자동 재연결 + 성공 시 같은 연결 탭 reload, 실패 시 버튼 — 완료 기준: C4 ①~⑥ (의존: S1)
- [ ] S3. 문서 갱신 — 완료 기준: docs/06에 `auto_reconnect` 설명이 있음 (의존: S2)
