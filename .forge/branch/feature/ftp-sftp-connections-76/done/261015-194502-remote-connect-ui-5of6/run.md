# run — 원격 연결 UI: 설정 탭, DriveBar 연결 메뉴, 비밀번호 대화상자, 패널 이동 (5/6)

직접 순차 실행.

## 슬라이스 결과
- S1 설정 "SFTP·FTP 서버" 탭(`RemoteServersControl`): 목록 + 폼(표시 이름·프로토콜·호스트·포트·사용자·시작 폴더), 저장은 `setRemoteServers`, FTP 선택 시 암호화 경고, 비밀번호 지우기 — ✅ 연결 그룹에 SMB 탭 뒤로 들어감(`REMOTE_SECTION`)
- S2 DriveBar "연결" 메뉴에 원격 항목(`SFTP · 이름`/`FTP · 이름`, 연결 중이면 비활성)과 "원격 서버 관리…" — ✅ 메뉴 제목을 "SMB 서버에 연결" → "서버에 연결"로 바꿨다(기존 SMB 테스트 문구 갱신)
- S3 store `connectRemote`/`disconnectRemote`/`setRemoteServers`/`remoteForgetPassword`, 비밀번호 대화상자 재사용(SMB와 같은 흐름) — ✅ 연결 중 목록이 바뀌면 멈춤, Esc 취소, 저장된 비밀번호는 묻지 않음
- S4 원격 경로에서 패널 표시·상위 이동·복사·이동·삭제 — ⚠ 여러 곳을 고쳤다: ① `isInside`/`volumeOf`가 원격 경로를 루트 볼륨(`/`)에 넣어 버리던 것 ② `Breadcrumb`가 `sftp://id`를 한 조각 루트로 ③ 전송 확인 창이 목적지 끝 `/`를 떼어 원격 루트(`sftp://id/`)가 깨지던 것 ④ 휴지통(F8)을 원격에서 영구 삭제+항상 확인으로 ⑤ 원격 파일 열기·편집·미리보기·폴더 크기 계산은 막고 안내
- S5 i18n ko·en — ✅
- S6 사람 확인(실제 SFTP/FTP 서버) — 이 드라이브에서는 하지 않았다. 마지막 보고서에 남긴다.

## DoD baseline → after
1. drive-bar 테스트 — 39개 통과(원격 메뉴 9개 추가, SMB 메뉴 테스트 2개는 "원격 서버 관리…" 항목이 늘어 기대값을 고침)
2. settings 테스트 — 38개 → 44개 통과(SFTP·FTP 탭 6개 추가, 탭 목록·그룹 기대값 갱신)
3. sftp가 들어간 테스트 파일 — 0 → 4(`remote.test.ts`(ts-client), `drive-bar`, `settings`, `remote-panel`)
4. 원격 패널 전송 — `remote-panel.test.tsx` 8개: 로컬→원격 F5, 원격→로컬 F5(바이트 내용), 원격 폴더 F6 이동, F8 영구 삭제+확인, F7 새 폴더, 열기 거부, 들어가기·상위 이동
5. tsc·vitest 전체·i18n 키 — 아래 확인
