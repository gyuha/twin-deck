<!-- forge-slug: remote-fs-vfs-3of6 -->
<!-- task: 171 -->
<!-- part: 3/6 -->
<!-- tdd: off -->
# 원격 경로 표기와 CompositeFs 라우팅: 원격 Vfs, 세션 관리, 원격↔로컬 복사·이동

## 목표 / 하지 않을 것
- 목표: 원격 폴더를 `VfsPath`로 표현하고(경로 표기를 ADR-0019에 추가), `CompositeFs`가 그 경로를 세션으로 라우팅하게 한다. 세션 레지스트리(연결 id → 열린 세션)를 두고, 기존 `Ops`·큐로 원격→로컬, 로컬→원격 복사와 원격 안 이동·이름 바꾸기·삭제·폴더 만들기가 되게 한다. 가짜 FTP·SFTP 서버로 서비스 테스트를 한다.
- 하지 않을 것: 설정 목록·키체인·Tauri 연결 명령(4/6), UI(5/6), 원격 폴더 파일 감시(주기 새로고침 정도는 4/6~5/6에서 UI가 요청할 때 다시 읽는 것으로 충분), 원격 휴지통(영구 삭제만 — `can_trash`는 false), 원격↔원격 직접 복사(로컬을 거치지 않는 경로는 만들지 않는다. 로컬 임시 파일 경유 또는 스트림 중계 중 단순한 쪽).

## 근거 문서
- 용어: `.forge/branch/feature/ftp-sftp-connections-76/CONTEXT.md`의 **원격 연결**
- 관련 ADR: `docs/adr/0019-remote-fs-in-process.md`, `docs/adr/0012-archive-path-notation.md`(경로 표기 선례), `docs/adr/0005-vfs-trait.md`
- 이슈 추적: GitHub 이슈 #76 (3/6)
- 구현 메모: 경로 표기는 `sftp://<연결id>/절대/경로`·`ftp://<연결id>/절대/경로`처럼 문자열로 `VfsPath`에 담는 안을 권장한다(Windows의 `PathBuf::join`이 `\`를 쓰는 문제는 `VfsPath::join`의 아카이브 분기처럼 원격 접두에도 `/`를 쓰게 고친다). `td-archive`의 `Loc`에 `Remote` 분기를 추가한다. `Vfs::copy_file(from, to)`가 한쪽이 원격이면 스트리밍으로 청크 복사한다(전체를 메모리에 올리지 않는다). 로컬 `LocalFs`·아카이브 동작은 바뀌지 않는다.
- 완료 정의(DoD):
  1. `cargo test -p twin-deck-desktop remote` 통과, `cargo test -p twin-deck-desktop remote -- --list 2>/dev/null | grep -c ': test'` ≥ 8 (작성 시점: 0 → 정방향)
  2. 테스트가 FTP와 SFTP 가짜 서버 각각에 대해 확인: 원격→로컬 복사, 로컬→원격 복사(바이트 동일), 폴더 재귀 복사, 원격 안 이동·이름 바꾸기, 삭제(영구), 폴더 만들기, 같은 이름 충돌 감지, 큐(`td-queue`) 경유 실행과 취소
  3. `cargo test -p td-archive`, `cargo test -p td-vfs`, `cargo test -p td-ops` 통과 (회귀 방지 — 작성 시점에도 통과)
  4. `cargo test -p td-vfs -p td-archive -- --list 2>/dev/null | grep -c -i 'remote\|원격'` ≥ 3 (경로 표기 파싱·join·parent 단위 테스트, Windows 구분자 규칙 포함 — 정방향)
  5. `cargo clippy -p td-archive -p td-vfs -p td-remote -- -D warnings`, `cargo fmt --check` 통과
  6. `grep -c '경로 표기\|sftp://' docs/adr/0019-*.md` ≥ 1

## 작업 단위
- [ ] S1. `VfsPath`/경로 표기: 원격 접두 판별·분해·결합(Windows 포함), 연결 id의 안전한 인코딩 — 완료 기준: DoD 4
- [ ] S2. 세션 레지스트리(`RemoteRegistry`: 연결 id ↔ `Arc<dyn RemoteSession>`, 열기·닫기·조회, 끊어진 세션 재연결 1회 시도) 와 `RemoteFs`(`Vfs` 구현, `RemoteEntry` → `Entry` 변환: 숨김은 점 시작, `mode`·`file_id`는 None) — 완료 기준: DoD 1 컴파일 (depends: S1)
- [ ] S3. `CompositeFs`에 원격 분기: list·stat·mkdir·create_file·rename·remove_*·info·read_head·copy_file(원격 포함 4방향 중 로컬↔원격·원격 안), `can_trash` false, `symlink`·`read_link`는 미지원 오류 — 완료 기준: DoD 2 일부 (depends: S2)
- [ ] S4. `Service` 테스트: 가짜 FTP·SFTP 서버를 띄워 레지스트리에 세션을 넣고 DoD 2의 시나리오를 `Ops`·큐로 실행(`remote_` 모듈 또는 이름) — 완료 기준: DoD 1·2 (depends: S3)
- [ ] S5. 회귀·clippy·fmt, ADR-0019에 경로 표기 절 추가 — 완료 기준: DoD 3·5·6 (depends: S4)
