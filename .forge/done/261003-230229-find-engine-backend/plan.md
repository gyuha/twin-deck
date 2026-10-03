<!-- forge-slug: find-engine-backend -->
<!-- task: 13 -->
<!-- part: 1/2 -->
<!-- tdd: off -->
# 파일 찾기 검색 엔진과 백엔드 연결 (td-search · Tauri · TS 클라이언트)

## 목표 / 비목표
- 목표: Double Commander "파일 찾기" 기본 탭의 조건을 그대로 받는 검색을 만든다. 질의 문자열(Look Up DSL) 대신 구조화된 명세를 쓴다.
  - `td-search`에 `FindSpec`과 `find(vfs, spec, opts, cancel, on_match) -> SearchReport`(기존 `walk`/`SearchReport`/`CancelToken` 재사용, 깊이·제외 지원을 위해 필요하면 `walk`와 별개의 순회를 둔다).
  - `FindSpec`: `roots: Vec<VfsPath>`(시작 디렉터리들), `only_items: Option<Vec<VfsPath>>`(있으면 이 경로들만 대상: 폴더는 재귀, 파일은 그 자체), `follow_symlinks: bool`, `exclude_dirs: String`, `max_depth: Option<u32>`(None=무제한, Some(0)=시작 폴더 바로 아래 항목만, Some(n)=n단계 아래 폴더까지), `mask: String`, `substring: bool`, `regex: bool`, `exclude_files: String`, `text: Option<TextSpec { pattern: String, case_sensitive: bool, regex: bool, invert: bool }>`.
  - 이름 일치 규칙(Double Commander 방식): 마스크와 제외 마스크는 `;`로 나눈 토큰들이고 대소문자와 NFC를 무시한다. `regex`면 마스크 전체를 정규식으로 보고 이름에서 찾는다(잘못된 정규식은 오류 문자열로 거부). 아니면 토큰마다 glob(`*`, `?`, `[]`; `td-vfs`의 glob 재사용)이고, `substring`이 켜져 있으면 와일드카드가 없는 토큰은 이름에 **포함**되면 일치, 꺼져 있으면 이름이 **정확히 같아야** 일치한다. 마스크가 비면 모든 이름이 일치한다. 이름 일치는 파일과 폴더 모두에 적용하고, `text`가 있으면 파일만 결과가 된다.
  - 제외: `exclude_dirs`에 맞는 이름의 폴더는 들어가지도 않고 결과에도 넣지 않는다. `exclude_files`에 맞는 이름의 항목은 결과에서 뺀다.
  - 텍스트 찾기: 파일 앞쪽 8KB에 NUL이 있으면 바이너리로 보고 건너뛴다. 16MB를 넘는 파일은 건너뛴다(건너뛴 수는 `unreadable`에 더하지 않고 별도 보고해도 된다). 내용은 UTF-8(깨진 바이트는 대체 문자)로 읽는다. `case_sensitive=false`면 대소문자 무시, `regex`면 정규식. `invert`면 텍스트가 **없는** 텍스트 파일이 결과다(바이너리·너무 큰 파일은 결과에 넣지 않는다).
  - 심볼릭 링크: 기본은 따라가지 않고 링크 자체를 한 항목으로 본다. `follow_symlinks`면 링크가 가리키는 폴더로 들어가되 **이미 방문한 실제 경로(canonical)는 다시 방문하지 않아** 순환에 빠지지 않는다.
  - `service`: `start_find(spec: FindSpecDto) -> ServiceResult<SearchStartDto>`(기존 `start_lookup`과 같은 job·Batcher 스트리밍·취소를 쓴다). Tauri 명령 `start_find`와 DTO(`FindSpecDto`, `TextSpecDto`), 바인딩 재생성.
  - TS: `Backend.startFind(spec)`, tauri 어댑터, `FakeBackend.startFind`(같은 규칙을 메모리 파일시스템에서 구현하고 `searchesStarted`에 `["find", ...]`를 남긴다. 파일 내용은 fake 노드의 `content`를 쓴다).
- 비목표: UI, 단축키, 바꾸기(내용 수정), Office XML, 인코딩 선택, 16진수, 압축파일 안 검색, 고급/플러그인/불러오기·저장/결과 탭. `regex` 의존성은 `td-search`에만 추가한다.

## 기준 문서
- 용어집: 없음 · 관련 ADR: 없음(검색 문법의 기존 결정은 ADR-0013, 이번 명세는 DSL을 바꾸지 않는다)
- 완료 정의(DoD): `.forge/branch/feat/file-find/loop.md`의 C4, C5 + C1·C2 회귀 없음.
  1. `cargo test -p td-search` 출력에 `find_matches_masks_recursively`, `find_respects_max_depth`, `find_excludes_dirs_and_files`, `find_substring_vs_exact_name`, `find_regex_name`, `find_text_in_files`, `find_text_inverted`, `find_follow_symlinks_without_looping`이 각각 `ok` (사전: 테스트 없음 → 전진 확인). 모두 `tempfile` 폴더에 실제 파일을 만들어 실제 `LocalFs` 순회로 검증한다. `find_follow_symlinks_without_looping`은 자기 부모를 가리키는 심볼릭 링크(unix)를 만들어 무한 순회 없이 끝나는지와, 따라가지 않을 때는 링크가 한 항목으로만 나오는지를 단언한다.
  2. `cargo test -p twin-deck-desktop start_find`에 `start_find_streams_matches ... ok`(서비스 계층에서 job을 시작해 스트리밍된 결과와 요약을 확인; 사전 없음 → 전진).
  3. 잘못된 정규식은 시작 즉시 오류 문자열(`ServiceResult` Err)로 거부된다(테스트 포함, 위 1 또는 2에 포함해도 된다).
  4. 바인딩 재생성(`UPDATE_BINDINGS=1 cargo test -p twin-deck-desktop up_to_date`) 후 환경 변수 없이 통과. `grep -c startFind packages/ts-client/src/generated/bindings.ts` ≥ 1 (사전 0).
  5. `Backend`·tauri 어댑터·`FakeBackend`에 `startFind`가 있고 `bun run typecheck` 0. `FakeBackend.startFind`가 (마스크 substring/정확히/정규식, 깊이, 제외, 텍스트/invert)를 구현한다는 것을 `packages/ts-client/src/client.test.ts`의 단위 테스트가 확인한다(통과).
  6. 회귀 방지(사전 통과 → 그대로): `cargo test --workspace` 0, `cargo fmt --all --check` 0, `cargo clippy -p td-search -p twin-deck-desktop -- -D warnings` 0, vitest 실패는 기존 pdf-preview 1건뿐.

## 작업 조각
- [ ] S1. `td-search::find`(명세·이름 일치·깊이·제외·텍스트·심볼릭 링크)와 Rust 테스트 8종 — 완료 기준: DoD 1, 3.
- [ ] S2. `service::start_find`·Tauri 명령·DTO·바인딩 재생성과 서비스 테스트 — 완료 기준: DoD 2, 4. (depends: S1)
- [ ] S3. TS `Backend.startFind`·tauri·fake 구현과 단위 테스트 — 완료 기준: DoD 5. (depends: S2)
- [ ] S4. 전체 회귀·품질 확인 — 완료 기준: DoD 6. (depends: S3)
