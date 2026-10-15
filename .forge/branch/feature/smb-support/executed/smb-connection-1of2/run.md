# 실행 기록 — SMB 연결 백엔드 (#167, 1/2)

워크플로 `wf_cb03d1fd-b7a`(에이전트 5개: td-config · td-smb · 문서 병렬 → 브리지 → 적대적 검토+DoD). 약 17분.

## 작업 단위별 결과
- S1 td-config `[[smb.servers]]`·검증·`set_smb_servers` — ✅ 계획대로 (+ 쓰기 시 빈 host/share 거부, 값 앞뒤 공백 제거)
- S2 td-smb 크레이트(URL·Mounter·NetFS·WNet) — ⚠ Windows는 `WNetAddConnection2W` 대신 `WNetUseConnectionW`+`CONNECT_REDIRECT`(드라이브 문자 자동 할당 때문). 게스트는 NetFS Guest 옵션
- S3 키체인(`keyring` 3.6, 서비스 `dev.twindeck.app.smb`) — ✅ 계획대로 (Linux는 저장 없음/Unsupported)
- S4 이미 마운트됨 판정 — ✅ 계획대로 (한계: IP↔호스트명·`.local`·`host:port` 표기가 다르면 못 알아봄)
- S5 브리지 — ⚠ 오류 구분을 위해 `SmbConnectDto = mounted | failed{kind,message}`, TS에서는 `SmbConnectError(kind)` throw. 별도 `list_smb_servers` 명령은 만들지 않음(설정 `Loaded`에 실림)
- S6 문서 — ✅ 00-overview 포함/제외/결정표, 02-architecture 크레이트 표 (검토 단계가 ADR-0018의 `net use` 문구를 WNet API로 바로잡음)
- S7 실제 NAS 확인 — ⏳ 사람 확인 대기

## DoD 기준값 → 실행 후
1. `cargo test -p td-smb`: 크레이트 없음 → 29 통과
2. td-smb clippy(macOS·Windows 타깃): 크레이트 없음(Windows 타깃은 실행 전 설치) → 둘 다 통과
3. `cargo test -p td-config` + `grep -c smb default.toml`: 통과·0 → 통과(17+53)·2
4. `up_to_date`: 통과(회귀 방지) → 재생성 후 2 통과
5. tsc + `bun run test`: 통과(회귀 방지, `bun install` 선행) → 통과(desktop 1372, ts-client 73 등)
6. 00-overview `SMB`: 제외 줄 1개 → 포함 줄 39·결정표 67, 제외 줄에 없음
7. 실제 NAS 마운트: 미실행 → 대기

## 계획과 달라진 점 / 남은 우려 (검토 결과)
- 비밀번호 누출 없음(로그·오류·Debug·config에 없음), FFI 소유권·널 종료 문제 없음으로 검토됨.
- 마운트 판정은 한쪽에 user가 없으면 user를 무시 → 게스트 항목이 다른 사용자로 마운트된 같은 공유를 돌려줄 수 있음.
- Windows 게스트(user 없음)는 NULL user = "현재 Windows 사용자로 연결"이지 익명 게스트가 아님. Windows 실기 확인 필요.
- 읽을 때 채운 기본 `name`(`host/share`)이 저장 시 파일에 그대로 기록됨.
- 실행 중 브랜치 이름이 `issue-triage` → `feature/smb-support`로 바뀌어 forge 루트를 옮겼다(사용자 요청, 임시 링크로 실행 중 에이전트 보호 후 제거).
