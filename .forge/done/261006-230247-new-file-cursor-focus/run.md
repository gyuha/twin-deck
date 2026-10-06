# 실행 기록 — Shift+F7로 새 파일을 만들면 커서를 새 파일로 옮긴다

## 슬라이스 결과
- S1 실패하는 테스트 먼저 추가 — ✅ red 확인: 구현 전에 "정렬상 맨 아래" 테스트와 "하위 폴더 안" 테스트가 실패(2건), "이미 있는 이름" 테스트는 이미 통과(회귀 방지)
- S2 `newFile`이 만든 뒤 커서를 옮긴다 — ✅ `store.ts`에 `cursorToCreated(typed)` 헬퍼를 만들어 `newFolder`와 `newFile`이 같이 쓴다(찾는 로직은 기존 `newFolder` 것을 그대로 옮김). 이름은 NFC로 비교한다.

## DoD baseline → after
1. `file-ops.test.tsx -t "새로 만든 파일"` — 구현 전 2 failed(+1 passed) → 3 passed. red → green 확인.
2. `newFile` 본문의 `cursorToCreated|setCursor` — 0 → 1. (구현을 헬퍼로 빼서 문구를 `setCursor` 단독에서 바꿨다. 동작은 1번이 값으로 단언한다.)
3. `tsc --noEmit` 통과, vitest(pdf-preview 제외) 84파일 732건 통과(기준선 729건 + 새 테스트 3건). 기존 `F7: 새로 만든 폴더…` 테스트 포함 사전 통과 유지.

## 판단·발견
- ⚠ 계획과 다름: 계획은 중첩 경로(`a/b.txt`)를 입력하면 맨 위 폴더로 커서가 간다고 했지만, **새 파일 만들기는 없는 상위 폴더를 만들지 않는다.** `FakeBackend.touch`는 상위 폴더가 없으면 오류이고(`need(parent)`), 실제 `LocalFs`도 같은 방향으로 보인다(확인은 fake 기준). 그래서 `zsub/deep.txt`는 만들어지지 않는다. 새 폴더(`mkdir`)는 중첩을 허용하므로 둘이 다르다. 이번 이슈 범위 밖이라 동작은 바꾸지 않았다. 대신 **이미 있는 하위 폴더 안에 만드는 경우**(`docs/n.txt`)에 커서가 그 폴더(`docs`)로 가는 것을 테스트로 고정했다. 이 동작이 의도한 것인지는 사용자가 판단한다(새 파일 자체가 아니라 그 폴더로 커서가 간다).
- 실제 앱(Tauri 백엔드)에서는 확인하지 못했다. 테스트는 FakeBackend 기준이다.
