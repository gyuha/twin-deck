# 실행 기록 — 원격 접속 PoC 1/2 (remote-daemon-poc-1of2)

실행: 2026-10-15, 워크플로 없이 이 세션에서 직접 순서대로(조각 4개 + 의존이 직선이라 위임 이득이 없음). TDD로 각 조각의 테스트를 먼저 써서 실패를 본 뒤 구현했다.

## 조각별 결과
- S1 프로토콜·핸드셰이크(버전, 토큰) — ✅ 계획대로 (`틀린_토큰은_…`, `프로토콜_버전이_다르면_…`)
- S2 서버 + `RemoteFs` list/stat/read_head — ✅ 계획대로 (숨김 포함·미포함 목록, stat, read_head가 `LocalFs`와 같음)
- S3 스트리밍 `read_to` — ✅ + 추가: 받는 쪽 쓰기 실패 때 남은 청크를 비우지 않아 다음 응답이 어긋나는 버그를 자체 검토에서 찾아 회귀 테스트와 함께 고침
- S4 데몬 모드 `--serve`/`--listen` — ⚠ 기본 포트를 6767 → 6868로 바꿈 (이 컴퓨터에서 Paseo가 127.0.0.1:6767을 쓰고 있음)

## 계획과 달라진 점
- **기본 포트 6868.** 계획에는 6767(Paseo에서 따옴)이었으나 실제로 Paseo 데몬이 그 포트를 쓰고 있어 같은 PC에서 함께 쓸 수 없었다.
- **`CompositeFs`에 `ServeFs` 구현을 이번 파트에서 넣었다.** 계획에는 "앱에서는 CompositeFs를 넘긴다"만 있었고 td-archive → td-remote 의존은 2/2 일로 보였다. 고아 규칙 때문에 앱 크레이트에서 구현할 수 없어서 td-archive에 의존을 더하고 구현했다(`tests/remote_serve.rs`로 원격 아카이브 안 파일 목록·읽기 확인). 2/2가 하던 일 일부를 앞당긴 것.
- **`ServeFs` 트레이트 추가.** `Vfs`에 스트리밍 읽기가 없어서 데몬이 내보낼 파일시스템에 `read_to`를 요구하는 트레이트를 두었다(`LocalFs`, `CompositeFs` 구현).
- `Reply::Stream`에서 크기 필드를 뺐다(아카이브 안 파일은 미리 크기를 보내기 번거로움, 받은 바이트 수로 충분).
- 토큰은 `TD_REMOTE_TOKEN`이 있으면 그 값, 없으면 OS 난수 32바이트(16진수).

## 남은 위험(검토에서 확인, PoC 범위라 고치지 않음)
- 접속마다 스레드 하나이고 핸드셰이크 시간 제한이 없다. 인증 전 연결을 많이 열면 스레드가 쌓인다(루프백 기본이라 노출은 작음).
- 전송 오류 뒤 연결을 다시 맺지 않는다. 2/2의 별칭별 연결 재사용에서 재연결을 다뤄야 한다.
- TLS 없음(ADR-0018에 단점으로 기록).

## 완료 기준 baseline → after
- `cargo test -p td-remote`: 패키지 없음(실패) → 단위 4 + 통합 6 통과
- `cargo test -p td-archive --test remote_serve`: 없음 → 1 통과
- `cargo clippy -p td-remote -p td-archive -p twin-deck-desktop --tests -- -D warnings`: (해당 없음) → 경고 0
- `cargo test -p td-remote -p td-archive -p twin-deck-desktop`: 실패 0
- `target/debug/twin-deck-desktop --serve`: 플래그 없음 → 창 없이 `ws://127.0.0.1:6868/`과 토큰 출력, 6868 LISTEN 확인 후 종료. `--listen nope`은 오류 문구와 종료 코드 2
