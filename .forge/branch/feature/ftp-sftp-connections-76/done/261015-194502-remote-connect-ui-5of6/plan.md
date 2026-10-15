<!-- forge-slug: remote-connect-ui-5of6 -->
<!-- task: 173 -->
<!-- part: 5/6 -->
<!-- tdd: off -->
# 원격 연결 UI: 설정 탭(서버 관리), DriveBar 연결 메뉴, 비밀번호 대화상자, 패널 이동

## 목표 / 하지 않을 것
- 목표: 사용자가 설정의 "연결" 그룹에서 SFTP·FTP 서버 항목을 추가·수정·삭제하고, DriveBar 연결 메뉴에서 골라 접속하면 그 패널이 원격 루트로 이동해 복사·이동·삭제를 기존 키·메뉴로 할 수 있게 한다. SMB UI(설정 SMB 탭, DriveBar 연결 메뉴, 비밀번호 대화상자)를 본뜨고 확장한다.
- 하지 않을 것: 팔레트 액션·기본 단축키 추가, 별도 OS 창, FTP 평문의 TLS 전환, 호스트 키 신뢰 대화상자, 원격 폴더 자동 감시(수동 새로고침으로 충분).

## 근거 문서
- 용어: `.forge/branch/feature/ftp-sftp-connections-76/CONTEXT.md`의 **원격 서버 항목**, **원격 연결**
- 관련 ADR: `docs/adr/0019-remote-fs-in-process.md`, `docs/adr/0016-i18n-dictionary-and-rust-catalog.md`
- 이슈 추적: GitHub 이슈 #76 (5/6)
- 구현 메모: 이슈의 "관리하는 창"은 설정 화면의 원격 서버 탭(SMB 탭과 같은 목록 + 항목 폼)으로 구현한다. FTP 항목은 폼과 연결 메뉴에서 "암호화되지 않음" 경고를 보인다. 대화상자 키 처리는 `useKeyboard.ts`의 dialog 예외 규칙을 따른다. 패널 경로 표시·상위 폴더 이동·경로 입력이 원격 접두에서 깨지지 않게 확인한다(`VfsPath` 표기는 3/6).
- 완료 정의(DoD):
  0. 선행 조건: `bun install`
  1. `cd apps/desktop && bunx vitest run src/__tests__/drive-bar.test.tsx` 통과 — 새 케이스: 연결 메뉴가 저장된 원격 항목을 프로토콜 표시와 함께 보여 줌 / 선택 → 접속 → 그 패널 경로가 원격 루트 / 이미 연결된 항목은 바로 이동 / Auth 오류면 비밀번호 대화상자 다시 / 그 외 오류는 메시지 / "서버 관리…"가 설정 원격 탭을 엶
  2. `bunx vitest run src/__tests__/settings.test.tsx` 통과 — 탭 목록에 원격 서버 탭, 추가·수정·삭제가 `setRemoteServers`로 저장됨(FakeBackend), FTP 선택 시 경고 문구
  3. `grep -rliE 'sftp' apps/desktop/src/__tests__ | wc -l` ≥ 2
  4. 원격 폴더에서 FakeBackend로 복사(F5)·이동(F6)·삭제 흐름이 `runTransfer` 경유로 되는 테스트: 원격 패널 ↔ 로컬 패널 복사 후 대상 패널 목록에 파일이 보임
  5. `bunx tsc --noEmit`, `bun run test` 전체 통과, `bunx vitest run src/__tests__/i18n-keys.test.ts` 통과(ko·en 키 짝), `grep -c 'remote' apps/desktop/src/i18n/ko.ts` ≥ 1
  6. 사람 확인(macOS, 실제 SFTP/FTP 서버, 격리 인스턴스나 dev 앱): 항목 추가 → 연결 → 비밀번호 입력(기억 체크) → 패널이 원격 폴더로 이동 → 로컬 패널로 복사 → 원격에 업로드 → 이동·삭제 → 다시 연결하면 비밀번호를 묻지 않음. 테스트로 고정할 수 없는 항목(실서버·WKWebView). 자동 완료 조건이 아니며 마지막 보고서에 남긴다.

## 작업 단위
- [ ] S1. 설정 화면 원격 서버 탭: `SECTIONS`에 섹션과 control(목록 + 항목 폼: 이름·프로토콜·호스트·포트·사용자·시작 폴더), 저장은 `setRemoteServers`, 저장된 비밀번호 지우기 — 완료 기준: DoD 2
- [ ] S2. DriveBar 연결 메뉴에 원격 항목 추가(SMB 항목과 구분해 표시), 연결 중 표시, 끝에 "서버 관리…" — 완료 기준: DoD 1의 메뉴·이동 케이스
- [ ] S3. store `api.connectRemote(pane, index)`: 비밀번호 필요·Auth 실패 → `ask()` 비밀번호 대화상자(가림 입력, "기억" 체크) → 재시도, 기타 오류 → 기존 오류 표시, 성공 → 패널 이동. 연결 끊기(DriveBar의 원격 연결 표시에서) — 완료 기준: DoD 1의 Auth·오류 케이스 (depends: S2)
- [ ] S4. 원격 경로에서 패널 표시·상위 이동·경로 입력·복사·이동·삭제 흐름 확인과 수정 — 완료 기준: DoD 4 (depends: S3)
- [ ] S5. i18n ko·en 문구 — 완료 기준: DoD 5
- [ ] S6. 사람 확인 — 완료 기준: DoD 6 (depends: S4)
