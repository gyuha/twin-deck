<!-- forge-slug: symlink-folders-sort-first -->
<!-- task: 137 -->
<!-- tdd: off -->
# 폴더를 가리키는 심볼릭 링크도 폴더처럼 목록 위쪽에 정렬한다

## 목표 / 하지 않을 것
- 목표: 파일 목록 정렬에서 폴더를 가리키는 심볼릭 링크(`kind: "symlink"`, `linkIsDir: true`)가 폴더 묶음 안에 놓이고, 어떤 정렬 기준(이름·크기·수정일·확장자, 오름·내림)에서도 파일보다 위에 온다. (GitHub 이슈 #47)
  - 원인(코드로 확인, [높음]): `lib/sort.ts`의 `sortEntries`가 폴더 묶음을 `e.kind === "dir"`로만 판단한다. 표시·열기·더블클릭은 이미 `isFolderEntry`(폴더이거나 폴더를 가리키는 링크)를 쓰므로 정렬만 어긋나 있었다.
  - 결정(사용자): 옵션 없이 항상 폴더와 함께 위에 둔다. 설정 키를 늘리지 않는다.
- 하지 않을 것: 설정 키·설정 화면 · Rust `sort_entries`(폴더 미리보기 트리에서만 쓰인다)와 생성 바인딩 변경 · 파일을 가리키거나 끊어진 링크의 정렬 변경(일반 파일 쪽 그대로) · 폴더 행 표시(`▸`)·크기 칸 같은 다른 `kind === "dir"` 판단(별개)

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음
- 관련 ADR: 없음
- 이슈 추적: GitHub 이슈 #47
- 갱신할 문서: `docs/07-ui-spec.md`(컬럼·정렬 설명에 한 문장)
- 완료 정의(DoD) = `.forge/loop.md`의 C1~C4

## 작업 조각
- [ ] S1. `sort.ts`가 `isFolderEntry`와 같은 규칙(폴더이거나 폴더를 가리키는 링크)으로 폴더 묶음을 정하게 한다. — 완료 기준: DoD 1, 2
- [ ] S2. 정렬 테스트(`lib.test.ts`)와 목록 순서 테스트(`folder-symlink.test.tsx`), 테스트 주석 갱신. (depends: S1) — 완료 기준: DoD 1, 2
- [ ] S3. `docs/07-ui-spec.md` 한 문장. (depends: S1) — 완료 기준: DoD 4
