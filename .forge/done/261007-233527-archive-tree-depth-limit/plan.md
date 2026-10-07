<!-- forge-slug: archive-tree-depth-limit -->
<!-- task: 89 -->
<!-- tdd: off -->
<!-- priority: high -->
# 압축 미리보기 트리가 깊은 경로에서 앱을 죽이지 않게 한다 (리뷰 B)

## Goal / Non-goals
- Goal: `service.rs`의 `archive_tree_lines`가 경로를 중첩 `BTreeMap` 트리로 만들고 함수가 끝날 때 재귀 drop이 일어나, 경로가 아주 깊은 압축 파일(zip 이름은 최대 65535바이트라 약 3만 단계)을 미리보면 스택 오버플로로 앱이 종료된다. 깊이가 어느 한도(예: 64단계)를 넘는 경로 구성요소는 `…`로 줄이거나 버리는 식으로 트리 깊이를 제한한다(재귀 drop과 `walk` 재귀가 모두 한도 안에 든다). 기존 출력(폴더 먼저·이름순·가지 문자·줄 수 한도)은 한도 이내 경로에서 달라지지 않는다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- 다른 미리보기 종류 변경
- 줄 수 한도(`ARCHIVE_PREVIEW_MAX_LINES`) 변경
- td-archive 변경
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `archive_tree_lines`(`service.rs:248-303`)는 반복 삽입 후 재귀 `walk`로 줄을 만든다. 리뷰에서 같은 함수를 복사해 깊이 32000, 8MB 스택에서 `stack overflow, aborting`을 재현했다. 기존 테스트 3개(`archive_tree_lines_*`)와 `preview_archive_*`가 출력 형식을 고정한다. `preview_file`은 동기 `#[tauri::command]`다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. `cargo test -p twin-deck-desktop archive_tree_lines_deep`(신규 테스트, 이름이 `archive_tree_lines_deep`으로 시작)가 통과한다: (a) 깊이 100000짜리 경로를 256KB 스택으로 만든 스레드(`std::thread::Builder::stack_size`)에서 `archive_tree_lines`에 넣으면 비정상 종료 없이 돌아오고 줄 수가 `max_lines` 이하이며 첫 줄이 비어 있지 않다 (b) 실제 zip(깊이 32000짜리 이름 항목 하나, `zip` 크레이트로 임시 폴더에 만듦)을 `archive_preview`(또는 이를 부르는 서비스 미리보기)에 256KB 스택 스레드에서 넣어도 `Some`을 돌려주고 종료되지 않는다. 구현 전에 (a)(b)가 프로세스 중단(스택 오버플로)으로 실패해야 한다.
  2. 기존 `cargo test -p twin-deck-desktop archive_tree_lines`와 `preview_archive`가 모두 통과한다(출력 형식 보존)
  3. `cargo clippy -p twin-deck-desktop -- -D warnings` 통과, `cargo test -p twin-deck-desktop`에서 새로 실패하는 테스트가 없다(`coalesce_*`는 병렬 시 흔들리는 기준선 잡음 — 단독 재실행으로 판정)

## Work slices
- [ ] S1. 먼저 실패하는 테스트: 깊은 경로 단위 테스트와 실제 zip 미리보기 테스트를 `service.rs` 테스트 모듈에 쓰고 red 기록 — completion criterion: DoD 1이 구현 전에 중단/실패
- [ ] S2. `archive_tree_lines`에 깊이 한도를 넣는다 — completion criterion: DoD 1·2 green (depends: S1)
