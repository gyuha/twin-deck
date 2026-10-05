<!-- forge-slug: archive-preview-tree -->
<!-- task: 57 -->
<!-- tdd: off -->
# 미리보기에서 압축 파일 안의 파일 목록을 텍스트 트리로 보여 준다

## Goal / Non-goals
- Goal: 압축 파일(`td-archive`가 폴더처럼 여는 형식)에 커서를 두고 미리보기를 열면 안의 항목을 텍스트 트리(들여쓰기, 폴더 구분)로 보여 준다. 항목이 매우 많으면 앞쪽만 보이고 잘렸다는 안내가 나온다. 압축이 아니거나 읽을 수 없으면 기존처럼 "미리볼 수 없음"이다.
- Non-goals: 압축 안 파일의 내용 미리보기, 크기·날짜 열, 비밀번호가 걸린 압축 처리, 새 설정 키.
- 이슈 추적: GitHub 이슈 #5

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cargo test -p twin-deck-desktop preview_archive` → 통과 ≥ 1, 실패 0. zip을 만들어 `preview`가 중첩 폴더를 들여쓴 텍스트 트리로 돌려주는지, 항목 수 한도에서 잘리는지, 깨진 압축은 `other`인지 단언한다. 전진 검사.
  2. `cd apps/desktop && bunx vitest run src/__tests__ -t "압축 파일 미리보기"` → 통과 ≥ 1, 실패 0. 미리보기 창에 트리 텍스트가 보이는지 단언한다. 전진 검사.
  3. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과(`PreviewDto` 변경 반영), `cargo clippy -p twin-deck-desktop -- -D warnings`와 `bunx tsc --noEmit` 통과.

## Work slices
- [ ] S1. `Service::preview`에 압축 파일 분기를 추가해 항목 목록을 텍스트 트리로 만든다(한도 있음) — completion criterion: DoD 1
- [ ] S2. `PreviewDto` 변경이 필요하면 반영하고 `task gen-types`, `backend.ts`·`tauri.ts`·`fake.ts` 연결 — completion criterion: DoD 3 (depends: S1)
- [ ] S3. `Preview.tsx`가 트리를 보여 준다 — completion criterion: DoD 2 (depends: S2)
