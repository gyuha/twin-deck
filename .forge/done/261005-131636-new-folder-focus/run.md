# run — F7로 새 폴더를 만들면 커서를 새 폴더로 옮긴다

워크플로우 없이 직접 실행했다(변경이 `newFolder` 한 곳이라). 테스트를 먼저 써서 빨간 상태를 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 `newFolder`가 `reloadAll()` 뒤에 새 폴더(중첩 경로면 맨 위 폴더)를 찾아 `setCursor` — ✅ 계획대로

## 계획과 달라진 점
- 없음. 스크롤은 `FileTable`이 커서 변경에 이미 반응해서(`scrollToIndex`) 따로 손대지 않았다.
- 이름 비교는 macOS NFD/NFC 차이를 고려해 `normalize("NFC")`로 맞췄다.
- 숨김 폴더(`.git` 등)를 만들면 목록에 없어서 커서는 움직이지 않는다(의도한 한계).

## DoD baseline → after
1. `vitest -t "새로 만든 폴더"` — 0 tests → 2 passed (전진 검사 충족. 구현 전 2개 모두 실패 확인)
2. `bunx tsc --noEmit` — 통과 → 통과 (회귀 방지). 전체 vitest: 610 통과, 1 실패(`pdf-preview` 기준선)
