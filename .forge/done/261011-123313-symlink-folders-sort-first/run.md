# run — 폴더 링크 정렬 (이슈 #47)

fg-run이 워크플로 없이 직접 실행했다(수정이 한 곳이라 워크플로 비용이 더 크다).

## 슬라이스별 결과
- S1 `lib/sort.ts`: 폴더 묶음 판단을 `kind === "dir"`에서 `isFolder`(폴더이거나 `kind: "symlink"`이면서 `linkIsDir`)로 바꿨다 — ✅ as planned. `isFolderEntry`(store.ts)를 직접 쓰지 않고 같은 규칙을 sort.ts에 두 줄로 옮겼다(store → sort 방향 의존이라 sort가 store를 import하면 순환).
- S2 테스트: `lib.test.ts`에 "심볼릭 링크 정렬" 5건, `folder-symlink.test.tsx`에 "목록 순서" 1건 — ⚠ 기존 테스트 2건을 새 순서에 맞게 고쳤다: "일반 폴더는 이전처럼 들어간다"는 "첫 항목이 realdir"을 가정해서 `goTo(realdir)`로, "더블클릭으로도 들어간다"는 `ArrowDown`을 0번 반복(빈 입력)해 오류가 나서 `goTo(dir-link)`로 바꿨다. 둘 다 검사 내용은 그대로이고 목록 맨 위가 바뀐 데 맞춘 것이다.
- S3 `docs/07-ui-spec.md` 한 문장 — ✅ as planned

## DoD baseline → after
1. 심볼릭 링크 정렬 테스트: 0 → 5 통과. **수정을 되돌리면 5건 모두 실패**(red → green 확인)
2. 목록 순서 테스트: 0 → 1 통과. 수정을 되돌리면 실패
3. 회귀: vitest 1173 통과·실패는 기준선(`pdf-preview`, `model-formats`)뿐, `tsc` 통과, Rust·생성 바인딩·설정 diff 비어 있음
4. `grep -c "폴더를 가리키는 심볼릭 링크" docs/07-ui-spec.md`: 0 → 1

## 어긋난 점·한계
- 실제 WKWebView 화면에서 정렬이 바뀐 것은 확인하지 않았다(`FakeBackend` 목록 수준의 시험).
- 폴더 미리보기 트리(Rust `sort_entries`)와 다른 `kind === "dir"` 판단(폴더 행의 `▸` 표시·크기 칸·확장자 칸 등)은 범위 밖이라 그대로다. 폴더 링크 행에는 지금도 `▸` 표시가 없다.
