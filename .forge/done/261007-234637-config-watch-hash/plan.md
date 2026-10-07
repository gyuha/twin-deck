<!-- forge-slug: config-watch-hash -->
<!-- task: 94 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 설정 감시가 같은 크기·같은 시각 편집도 놓치지 않게 내용을 비교한다 (리뷰 H)

## Goal / Non-goals
- Goal: `ConfigStore` 감시 스레드가 설정 파일 서명을 (수정 시각, 크기)만으로 비교해, 타임스탬프 해상도가 거친 파일 시스템에서 같은 길이의 값으로 두 번 고치면(`16`→`18`) 두 번째가 무시된다. 또 기준 서명을 `load_dir`보다 늦게(스레드 안에서) 구해서 그 사이의 수정이 영구히 버려질 수 있다. 서명에 내용 해시를 넣고, 기준 서명을 `load_dir` 이전에 구해 스레드에 넘기며, `state.json`만 바뀌면 알리지 않는 현재 동작은 유지한다. `apps/desktop/src/state/store.ts:836` 주석도 지금 동작에 맞게 고친다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- `state.json` 저장 방식 변경
- 프런트의 `onConfigChanged` 처리 변경(주석만)
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `crates/td-config/src/store.rs`의 `signature`·`start`. 3b921a5가 `now == last`면 건너뛰도록 바꿨다. 기존 `config_watch_reload`, `config_watch_ignores_unrelated_files`.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. `cargo test -p td-config config_watch_same_size`(신규, 이름이 `config_watch_same_size`로 시작)가 통과한다: `config.toml`의 값을 같은 크기의 다른 값으로 바꾸고 `File::set_modified`로 수정 시각을 이전과 같게 되돌린 뒤에도 재로딩 이벤트가 오고 새 값이 반영된다. 구현 전에 실패(red)해야 한다.
  2. 기존 `cargo test -p td-config`가 모두 통과한다(`config_watch_reload`, `config_watch_ignores_unrelated_files` 포함), `cargo clippy -p td-config -- -D warnings` 통과
  3. `grep -c "어떤 파일이 바뀌어도" apps/desktop/src/state/store.ts` → 0 (착수 전 1)

## Work slices
- [ ] S1. 먼저 실패하는 테스트 — completion criterion: DoD 1 구현 전 실패
- [ ] S2. 서명에 내용 해시, 기준 서명을 load_dir 앞에서 구하기, 주석 정정 — completion criterion: DoD 1·2·3 green (depends: S1)
