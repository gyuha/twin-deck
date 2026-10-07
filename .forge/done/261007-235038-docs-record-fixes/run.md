# RUN — 바뀐 동작과 어긋난 문서·기록을 바로잡는다 (리뷰 J, 공개 댓글 제외)

- S1 문서·설명·기록 수정 — ✅ `docs/07-ui-spec.md`(macOS Alt+↑ → Windows·Linux), `Settings.tsx`·`config.rs`(+생성된 `bindings.ts` 주석)·README의 드라이브 바 설명(용량은 경로 표시줄 오른쪽 끝), 봉인 기록 3곳(#86 run.md, #87 run.md·STATUS.md)에 정정 노트 추가(원문은 지우지 않음)

## DoD baseline → after (grep)
1. `macOS의 \`Alt+↑\`` docs/07: 1 → 0
2. `남은 용량` Settings.tsx: 1 → 0, config.rs 주석·README 갱신
3. `정정` 3곳: 각 0 → 1
4. vitest 840 통과(기준선 1파일), tsc 0, td-config 29건, up_to_date 통과

## 차이·메모
- 이 작업은 grep으로 검증하므로 red 단계가 없다.
- 이슈 #22의 공개 댓글("오른쪽 방향키")은 정정하지 않았다. 외부 글쓰기라 승인이 필요하다 — 정정 문안: "상위 폴더로는 ←(왼쪽 방향키)나 Backspace로 이동합니다. →는 폴더 안으로 들어갑니다."
- `docs/05` 등 다른 문서에 같은 오류가 더 있는지는 전수 점검하지 않았다.
