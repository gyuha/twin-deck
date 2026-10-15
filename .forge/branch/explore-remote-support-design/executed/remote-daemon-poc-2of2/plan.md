<!-- forge-slug: remote-daemon-poc-2of2 -->
<!-- task: 167 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 원격 접속 PoC 2/2: `td://별칭/경로`를 패널에서 열고 원격→로컬로 복사 (이슈 #72)

## 목표 / 비목표
- 목표: 설정의 `[remote.hosts.<별칭>]`(주소, 토큰)으로 원격 호스트를 등록하고, `CompositeFs`가 `td://별칭/…` 경로를 원격 데몬으로 라우팅한다. 패널에 원격 경로를 입력하면 목록이 보이고, F5로 원격 파일을 로컬 패널로 복사할 수 있다. 문서의 범위(00-overview, ADR-0003)를 ADR-0018에 맞춘다.
- 비목표: 로컬→원격 전송, 원격 안 작업(삭제·이름 변경·압축·해제·원격 안 복사)의 데몬 위임, 호스트 등록 UI와 설정 화면 편집(설정 파일 직접 편집), 원격 폴더 감시(자동 새로 고침), 원격 미리 보기 중 스트리밍이 필요한 형식(동영상 등), 릴레이·E2E·QR 페어링. 원격 경로에서 지원하지 않는 작업은 알아볼 수 있는 오류로 끝나야 하고 앱이 멈추면 안 된다.

## 기준 문서
- 용어: `.forge/branch/explore-remote-support-design/CONTEXT.md`의 원격 호스트·원격 데몬·원격 경로
- 관련 ADR: `docs/adr/0018-remote-daemon.md`, `docs/adr/0012-archive-path-notation.md`, `docs/adr/0003-in-process-ipc.md`
- 그릴링에서 정한 것:
  - 경로 기준 라우팅: `td://` 접두사면 원격. 별칭 뒤의 나머지는 원격의 경로 그대로(`!/` 포함)이며 원격 `CompositeFs`가 해석한다. Windows 원격은 `td://win/C:/Users/...`.
  - `CompositeFs::copy_file`(`crates/td-archive/src/composite.rs:309`)의 위치 조합 분기에 `(원격, 로컬)`을 더해 `RemoteFs::read_to`로 스트리밍한다. 그 밖의 원격 조합은 "PoC에서 지원하지 않음" 오류.
  - 설정 키 추가 절차(AGENTS.md): `td-config` 구조체 + `default.toml` → `task gen-types`. 설정 화면(`Settings.tsx` `SECTIONS`)에는 넣지 않는다 — 탭 목록 테스트가 요구하면 그 테스트 기준을 따른다.
  - 원격 연결은 별칭별로 재사용하고, 연결 실패는 목록 오류로 보여 준다.
- 완료 기준: (a) `cargo test -p td-archive`에 `td://` 라우팅·원격→로컬 복사 테스트(루프백 데몬 사용)가 추가되어 통과, (b) `task gen-types` 후 `up_to_date` 테스트 통과, (c) `cd apps/desktop && bunx vitest run`과 `bunx tsc --noEmit` 통과, (d) 격리 인스턴스 두 개(하나는 `--serve`)로 실제 앱에서 원격 경로 목록 표시와 F5 복사 결과 파일이 원본과 같은지 확인, (e) `docs/00-overview.md` 제외 목록과 `docs/adr/0003`에 ADR-0018을 반영.
  - 사전 상태(2026-10-15 실행): `grep -c "td://" crates/td-archive/src/composite.rs` → 0, `td-config`에 `remote` 없음(정방향 검사, 모두 아직 실패로 올바름).

## 작업 조각
- [ ] S1. 설정 `[remote.hosts.<별칭>]`(address, token) 추가와 타입 재생성 — 완료 기준: 설정 병합·검증 테스트가 별칭 맵을 읽고, `up_to_date` 테스트가 통과한다
- [ ] S2. `CompositeFs`의 원격 위치 라우팅(list/stat/read_head/info) — 완료 기준: 루프백 데몬을 별칭으로 등록한 `CompositeFs`에서 `td://별칭/…` 목록이 원격 폴더와 같고, 모르는 별칭은 알아볼 수 있는 오류가 되는 테스트가 통과한다 (depends: S1)
- [ ] S3. `(원격, 로컬)` 복사 — 완료 기준: `td://별칭/파일`을 로컬로 `copy_file` 한 결과가 원본과 바이트까지 같고, 원격 쓰기 계열은 "지원하지 않음" 오류가 되는 테스트가 통과한다 (depends: S2)
- [ ] S4. 앱 연결부 정리: 원격 경로는 폴더 감시에서 빼고, 상위 폴더·브레드크럼이 `td://별칭/`에서 멈춘다 — 완료 기준: 해당 vitest/서비스 테스트가 통과하고 원격 경로로 이동해도 오류 없이 목록이 뜬다 (depends: S2)
- [ ] S5. 실제 앱 확인과 문서 반영 — 완료 기준: 완료 기준 (d)를 수행한 결과를 run.md에 기록하고, (e)의 문서 수정이 들어간다 (depends: S3, S4)
