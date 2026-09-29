# ADR-0003. 데몬 없이 in-process IPC

- 상태: Accepted
- 날짜: 2026-09-29

## 맥락

Spacedrive는 `sd-daemon`을 별도 프로세스로 두고 Tauri의 `daemon_request`가 TCP 연결로 개행 구분 JSON을 보내는 CQRS 스타일 RPC를 쓴다. 이는 데스크톱, 모바일, 서버, CLI가 같은 코어를 공유하기 위한 구조다.

twin-deck은 데스크톱 클라이언트 하나뿐이고 모바일과 원격 접속이 범위 밖이다.

## 결정

Rust 코어를 Tauri 프로세스 안에서 라이브러리로 호출한다. UI와의 통신은 Tauri command(요청/응답)와 event(푸시)로 하고, specta로 TS 타입을 생성한다. 코어는 UI에 의존하지 않는 별도 크레이트(`td-*`)로 유지한다.

## 결과

- 장점: 프로세스 수명, 포트, 인증, 재연결 문제가 없다. 구현과 디버깅이 단순하다.
- 단점: 나중에 CLI나 원격 접속이 필요해지면 데몬화 작업이 필요하다. 코어를 별도 크레이트로 분리해 두어 그 비용을 줄인다.
- 후속: Spacedrive의 `daemon_request`, `subscribe_to_events` 계열 명령과 `useNormalizedQuery` 훅은 사용하지 않는다.

## 검토한 대안

| 대안 | 기각 이유 |
|---|---|
| Spacedrive식 데몬 + TCP RPC | 단일 클라이언트에 불필요한 복잡도 |
| 로컬 소켓 데몬 | 위와 같음 |
