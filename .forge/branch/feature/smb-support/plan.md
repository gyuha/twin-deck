<!-- forge-slug: smb-connection-2of2 -->
<!-- task: 168 -->
<!-- part: 2/2 -->
<!-- tdd: off -->
# SMB 연결 UI: 설정 SMB 탭, DriveBar 연결 메뉴, 비밀번호 대화상자

## 목표 / 하지 않을 것
- 목표: 1/2의 백엔드로 사용자가 SMB 서버 항목을 설정 화면에서 추가·수정·삭제하고, DriveBar의 "연결" 메뉴에서 골라 마운트한 뒤 그 패널이 마운트 경로로 이동하게 한다.
- 하지 않을 것: 팔레트 액션·기본 단축키(이번엔 DriveBar 메뉴만), 별도 OS 창, 공유 목록 조회, 연결 해제 전용 UI(기존 DriveBar 언마운트 버튼 재사용), Linux 지원, SFTP/FTP(#76).

## 근거 문서
- 용어: `.forge/branch/feature/smb-support/CONTEXT.md`의 **SMB 서버 항목**, **SMB 연결**
- 관련 ADR: `docs/adr/0018-smb-via-os-mount.md`
- 이슈 추적: GitHub 이슈 #77
- 완료 정의(DoD):
  0. 선행 조건: 이 worktree에는 `node_modules`가 없어 vitest가 `vite`를 못 찾는다(작성 시점 확인) → 먼저 `bun install`
  1. `cd apps/desktop && bunx vitest run src/__tests__/drive-bar.test.tsx` 통과 — 새 테스트: 연결 메뉴가 저장된 항목을 보여 줌 / 선택 → 마운트 → 그 패널 경로가 마운트 지점 / 이미 마운트된 항목은 바로 이동 / Auth 오류면 비밀번호 대화상자 다시 / 그 외 오류 메시지 / "서버 관리…"가 설정 SMB 탭을 엶 (작성 시점: 파일은 있고 기존 테스트 통과 — 새 케이스가 정방향)
  2. `bunx vitest run src/__tests__/settings.test.tsx` 통과 — 탭 목록에 SMB 탭, 추가·수정·삭제가 `setSmbServers`로 저장됨(FakeBackend)
  3. `bunx tsc --noEmit`, `bun run test` 전체 통과
  4. `bunx vitest run src/__tests__/i18n-keys.test.ts` 통과(ko·en 키 짝, ADR-0016)와 `grep -c 'smb' apps/desktop/src/i18n/ko.ts` ≥ 1 (작성 시점: 키 테스트는 통과 — 회귀 방지 검사, grep은 정방향)
  5. 사람 확인(macOS, 격리 인스턴스나 dev 앱): 설정에서 NAS 항목 추가 → DriveBar 연결 → 비밀번호 입력(기억 체크) → 패널이 `/Volumes/<공유>`로 이동하고 볼륨 버튼이 생김 → 언마운트 → 다시 연결하면 비밀번호를 묻지 않음. 테스트로 고정할 수 없는 항목(WKWebView·실제 마운트)

## 작업 단위
- [ ] S1. 설정 화면 SMB 탭: `SECTIONS`에 섹션 추가, 새 control 타입(목록 + 항목 폼: 표시 이름·호스트·공유·사용자), 저장은 `setSmbServers`, 저장된 비밀번호 지우기 버튼(키체인 삭제) — 완료 기준: DoD 2
- [ ] S2. DriveBar "연결" 버튼 + 메뉴(`PopupMenu` 재사용): 저장 항목, 연결 중 표시(UI 비차단), 끝에 "서버 관리…" — 완료 기준: DoD 1의 메뉴·이동 케이스 (depends: S1은 아님, 병렬 가능)
- [ ] S3. 연결 흐름: store `api.connectSmb(pane, index)` — 이미 마운트 → 이동 / 비밀번호 필요·Auth 실패 → `ask()` 비밀번호 대화상자(가림 입력, "기억" 체크) → 재시도 / 기타 오류 → 기존 오류 표시 / 성공 → 볼륨 목록 갱신 + 패널 이동. 대화상자 키 처리는 `useKeyboard.ts`의 dialog 예외 규칙을 따른다 — 완료 기준: DoD 1의 Auth·오류 케이스 (depends: S2)
- [ ] S4. i18n ko·en 문구, `docs/05-actions-keybindings.md`는 새 액션이 없으므로 손대지 않음, `README.md`·`README.en.md` 기능 목록에 SMB 연결 한 줄(짝 규칙) — 완료 기준: DoD 4, 두 README 모두 반영
- [ ] S5. 사람 확인 — 완료 기준: DoD 5 (depends: S3)
