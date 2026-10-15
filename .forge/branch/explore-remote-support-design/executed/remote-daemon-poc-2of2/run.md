# 실행 기록 — 원격 접속 PoC 2/2 (remote-daemon-poc-2of2)

실행: 2026-10-15, 이 세션에서 직접 순서대로(TDD: 조각마다 실패하는 테스트를 먼저 보고 구현).

## 조각별 결과
- S1 설정 `[remote.hosts.<별칭>]` — ⚠ 계획과 다르게 `Config`가 아니라 `Loaded.remote_hosts`(`#[serde(skip)]`)에 두어 **토큰이 웹뷰로 가지 않게** 했다. 그래서 타입 재생성(gen-types)이 필요 없고 바인딩은 바뀌지 않았다. 기본값에 없는 키라 병합 전에 꺼내 따로 검증한다
- S2 `CompositeFs`의 `td://` 라우팅(list/stat/read_head/info) — ✅ + 원격 항목의 `file_id`를 지운다(원격 PC의 inode가 로컬과 우연히 같으면 td-ops가 같은 파일로 보고 복사를 거부할 수 있어서)
- S3 `(원격, 로컬)` 복사 — ✅ 그 밖의 원격 조합과 원격 쓰기·이름 변경·삭제·심볼릭 링크는 "원격 경로에서는 아직 지원하지 않음". 원격은 `can_trash=false`라 휴지통도 막힌다
- S4 앱 연결부 — ✅ 서비스 `watch/unwatch`가 원격 경로를 건너뛴다, `parentPath`가 `td://별칭`에서 멈춘다, 경로 표시줄이 `td://별칭`을 루트로 나눈다(`remoteRoot` 추가)
- S5 실제 앱 확인·문서 — ⚠ 문서는 반영(00-overview 제외 목록, ADR-0003 개정 메모, ADR 목록, ADR-0018 보강). 실제 앱은 격리 인스턴스가 원격 데몬에 연결(목록 요청)한 것까지 확인했고, **화면 확인과 F5 복사는 사람이 확인해야 한다**(이 세션에 손쉬운 사용·화면 기록 권한이 없어 키 입력·캡처 불가)

## 계획과 달라진 점·그 자리에서 정한 것
- 토큰 비노출(위 S1). 계획은 "토큰이 경로·탭·이력에 섞이지 않는다"까지였는데, 설정 객체가 통째로 웹뷰로 가는 것을 보고 더 막았다
- `RemoteFs`에 연결 시간 제한(5초)과 끊김 표시(`is_broken`)를 더하고, `CompositeFs`가 끊긴 연결을 다시 맺는다. 1/2의 남은 위험(재연결 없음)을 해소
- 설정이 바뀔 때마다(테마 등) 원격 연결을 끊지 않도록 호스트 목록이 바뀐 경우에만 연결을 비운다
- 검토에서 찾아 고침: `config.toml` 문법 오류 때 이전 설정을 유지하는 경로가 원격 호스트만 비우던 문제(회귀 테스트 추가)
- i18n: Rust의 새 한국어 문구를 대응표(`RUST_MESSAGES`, 사용자에게 보이는 원격 오류)와 내부 목록(`RUST_INTERNAL`, 데몬 터미널 출력)에 넣었다(`i18n-rust-messages.test.ts`)
- 이 워크트리에 JS 의존성이 없어 `bun install`을 실행했다(잠금 파일 변경 없음)
- 실제 앱 확인 중 실수: 처음 쓴 격리 `state.json`에 필수 `paletteQuery`가 없어 앱이 기본 폴더로 떴다. 고쳐서 다시 띄운 뒤 연결 확인

## 남은 한계(사용자에게 보이는 것)
- 원격→로컬 복사의 바이트 진행률은 파일 하나가 끝날 때 한 번에 오른다(스트리밍 중간 진행 보고 없음)
- 원격 폴더는 자동 새로 고침되지 않는다
- 로컬→원격, 원격 안 작업은 오류로 끝난다(지원하지 않음)
- 호스트 등록은 `config.toml` 직접 편집만

## 완료 기준 baseline → after
- (a) `cargo test -p td-archive`(remote_route 4, remote_serve 1): 없음 → 통과. `td://` 검색: 0 → 있음
- (b) `up_to_date`(바인딩 최신 여부): 통과 → 통과(바인딩 변경 없음 — 토큰을 `serde(skip)`으로 둔 결과)
- (c) `bunx vitest run`: 실행 불가(의존성 없음) → 165 파일 1363 테스트 통과. `bunx tsc --noEmit` 통과
- (d) 실제 앱: 격리 인스턴스(pid 79148)가 `127.0.0.1:6869` 데몬에 ESTABLISHED. 화면·F5 복사는 사람 확인 필요
- (e) 문서: 00-overview·ADR-0003·ADR 목록·ADR-0018 반영
- 그 밖: `cargo test -p td-remote -p td-archive -p td-config -p td-ops -p twin-deck-desktop` 통과(단, `quicklook_timeout_kills_the_child`가 병렬 부하에서 한 번 실패 → 단독 3회·전체 재실행 통과, 이 변경과 무관한 시간 의존 테스트). clippy(-D warnings)·fmt 통과

## UAT (2026-10-15)
- 사용자가 격리 인스턴스에서 확인: 왼쪽 패널 `td://office/tmp/td-remote-data/문서` 목록과 경로 표시줄 정상, F5로 `큰파일.bin`(3MB)·`메모.txt`·`하위/` 복사. 첫 확인 때는 파일만 골라 폴더가 없었고, 폴더를 다시 복사한 뒤 `cmp`·`diff -r`로 세 항목 모두 원본과 같음을 확인했다.
