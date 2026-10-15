<!-- forge-slug: remote-docs-6of6 -->
<!-- task: 174 -->
<!-- part: 6/6 -->
<!-- tdd: off -->
<!-- priority: low -->
# 원격 연결 문서: 개요 범위, README 짝, 크레이트·경로 표기 문서

## 목표 / 하지 않을 것
- 목표: SFTP·FTP 연결이 제품 범위에 들어왔음을 문서에 반영한다. `docs/00-overview.md` 포함·제외 줄과 결정 표, `README.md`·`README.en.md` 기능 목록(짝 규칙), 아키텍처 문서의 크레이트 표에 `td-remote`.
- 하지 않을 것: 코드 변경, 버전 올리기·CHANGELOG(배포 때 쓴다), `docs/05-actions-keybindings.md`(새 액션·단축키가 없다).

## 근거 문서
- 용어: `.forge/branch/feature/ftp-sftp-connections-76/CONTEXT.md`
- 관련 ADR: `docs/adr/0019-remote-fs-in-process.md`, `docs/adr/0018-smb-via-os-mount.md`
- 이슈 추적: GitHub 이슈 #76 (6/6 — 이 부분이 봉인될 때 이슈 완료를 사용자에게 알린다. 닫는 일은 PR/배포 때 한다)
- 완료 정의(DoD):
  1. `grep -n 'SFTP\|FTP' docs/00-overview.md`가 포함 목록의 "SFTP·FTP 연결 관리" 줄과 결정 표의 ADR-0019 행을 보여 준다 (작성 시점: 제외 줄 1개만)
  2. `grep -n '자체 원격 파일시스템' docs/00-overview.md`의 제외 줄에서 SFTP가 빠졌다(줄이 없어지거나 SFTP를 뺀 다른 항목만 남음) (작성 시점: SFTP 포함 → 정방향)
  3. `grep -ci sftp README.md` ≥ 1 이고 `grep -ci sftp README.en.md` ≥ 1, 두 파일 첫 줄의 언어 링크 유지 (작성 시점: 둘 다 0 → 정방향)
  4. `grep -rn 'td-remote' docs/02-architecture.md` ≥ 1줄(크레이트 표) (작성 시점: 0 → 정방향)
  5. `grep -c 'SFTP\|sftp' docs/adr/README.md` ≥ 1 (ADR 목록에 0019 등재, 해당 목록 형식을 따른다) — 목록 파일이 ADR을 나열하지 않는 형식이면 이 항목은 건너뛰고 이유를 run.md에 적는다

## 작업 단위
- [ ] S1. `docs/00-overview.md` 고치기 — 완료 기준: DoD 1·2
- [ ] S2. `README.md`·`README.en.md` 기능 목록에 SFTP·FTP 연결 한 줄씩 — 완료 기준: DoD 3
- [ ] S3. `docs/02-architecture.md` 크레이트 표, `docs/adr/README.md` 목록 — 완료 기준: DoD 4·5
