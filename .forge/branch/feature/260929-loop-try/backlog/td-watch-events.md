<!-- forge-slug: td-watch-events -->
<!-- task: 4 -->
<!-- priority: medium -->
<!-- tdd: off -->
# td-watch: 디렉터리 변경 감시와 이벤트

## Goal / Non-goals
- Goal: `crates/td-watch`(`notify` 크레이트 기반, 자체 구현)로 디렉터리 감시를 시작/중지하고 변경을 디바운스된 "디렉터리 변경됨" 이벤트로 내보낸다. 목록 갱신 트리거 용도다.
- Non-goals: 재귀 인덱싱, 이벤트 저장, Spacedrive `sd-fs-watcher` 이식.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0004
- Definition of Done: `cargo test -p td-watch`가 통과하고 이름 있는 테스트 `watch_external_change`가 존재: tempdir을 감시 중일 때 별도 스레드가 파일을 생성/삭제/이름 변경하면 제한 시간(예: 5초) 안에 해당 디렉터리에 대한 이벤트를 수신. 감시 중지 후에는 이벤트가 오지 않음을 검증하는 테스트 포함.

## Work slices
- [ ] S1. `Watcher` API(watch/unwatch, 채널로 이벤트 전달) + 디바운스 — completion criterion: 컴파일 및 단위 테스트 통과
- [ ] S2. 실제 fs 통합 테스트 `watch_external_change` — completion criterion: 생성/삭제/이름 변경 각각에서 이벤트 수신 단언 통과 (depends: S1)
- [ ] S3. unwatch 후 무이벤트 검증 — completion criterion: 테스트 통과 (depends: S1)
