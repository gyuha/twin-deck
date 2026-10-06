<!-- forge-slug: folder-preview-ascii-tree -->
<!-- task: 73 -->
<!-- tdd: off -->
# 폴더 미리보기에서 하위 항목을 ASCII 트리 텍스트로 보여 준다

## Goal / Non-goals
- Goal: 미리보기(`Space`)에서 폴더를 고르면 지금의 "폴더 — 미리 볼 수 없는 형식입니다" 대신, 그 폴더의 하위 항목을 폴더 느낌이 나는 ASCII 트리 텍스트로 보여 준다. 폴더가 먼저, 그다음 파일, 각각 이름순. 형태 예:
  ```
  📁 docs/
  ├── 📁 adr/
  │   └── 0001.md
  ├── 00-overview.md
  └── 05-actions-keybindings.md
  ```
  (아이콘 이모지는 쓰지 않고 `이름/`으로 폴더를 구분해도 된다 — 단 가지 문자 `├── └── │`는 쓴다.) 깊이와 항목 수에 상한을 두고(깊이 3, 최대 200줄) 넘으면 `truncated`로 표시한다. 기존 아카이브 미리보기(`archive_preview`, Text 종류로 돌려주는 방식)와 같은 경로로 처리한다.
- Non-goals: 미리보기 창 동작·크기 변경, 아카이브/cbz 미리보기 변경, 새 설정 키, 심볼릭 링크 따라가기, 숨김 파일 필터 설정.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cargo test -p twin-deck-desktop preview_dir` 통과이고 `preview_dir_`로 시작하는 테스트가 3개 이상 실행됨 (사전: 0개 실행 — 전진 검사): (a) 폴더·파일 혼합이 `├── `/`└── `/`│   ` 가지와 폴더 먼저·이름순으로 나온다, (b) 깊이 상한을 넘으면 더 안 들어가고 `truncated`, (c) 항목 200줄 초과 시 `truncated`이고 줄 수가 200.
  2. `cd apps/desktop && bunx vitest run src/__tests__/folder-preview.test.tsx` 통과, 폴더를 열면 `├──`가 화면에 보이고 '미리 볼 수 없는 형식' 문구가 폴더에서는 안 나온다(기타 파일은 기존 문구 유지).
  3. `cargo test --workspace`와 `cd apps/desktop && bunx vitest run`이 기존 기준선(audio-preview·preview-scroll PDF·theme 3건 실패)과 같거나 좋다. 회귀 방지 항목이라 사전 통과가 정상.
  4. `cd apps/desktop && bunx tsc --noEmit` 통과. `task gen-types` 후 `git diff --quiet packages/ts-client/src/generated`.
  5. 미리보기 문서에 폴더 트리 설명이 한 줄 이상 있다: `grep -rn "ASCII 트리" docs | wc -l` ≥ 1 (사전: 0 — 전진 검사).

## Work slices
- [ ] S1. `service.rs` `preview`가 디렉터리를 `dir_preview`(깊이 3·200줄 상한, 폴더 먼저·이름순, 가지 문자)로 Text 종류로 돌려주고 `preview_dir_*` 테스트 추가 — completion criterion: DoD 1
- [ ] S2. `FakeBackend.preview`가 폴더에 같은 형식 트리를 돌려주고 `Preview.tsx` 표시를 확인(폴더는 text 경로로 표시), `folder-preview.test.tsx` 추가 — completion criterion: DoD 2 (depends: S1)
- [ ] S3. 문서 한 줄 추가와 회귀 확인 — completion criterion: DoD 3, 4, 5 (depends: S2)
