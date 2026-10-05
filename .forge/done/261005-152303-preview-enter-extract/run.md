# run — 압축 파일 미리보기에서 Enter를 누르면 압축을 푼다

워크플로우 없이 직접 실행했다. 테스트를 먼저 써서 빨간 상태를 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 `core.preview.open` 핸들러를 `api.previewOpen()`으로 바꿨다. 미리보기를 닫고, 커서 항목이 압축 파일이면 `extract()`, 아니면 `open()` — ✅
- S2 미리보기 하단 안내를 압축 파일이면 `Enter 압축 풀기`, 아니면 `Enter 열기`로, `docs/05`에 `core.preview.open` 행 추가 — ⚠ docs/05에는 이 액션 행이 원래 없어서 수정이 아니라 새로 추가했다

## 계획과 달라진 점
- 안내 문구를 계획의 `Enter: 압축 풀기`가 아니라 기존 안내 형식(`Enter 열기`)에 맞춰 `Enter 압축 풀기`로 했다.
- 미리보기 안내 문구는 파일 이름과 설정의 추가 확장자로 압축 여부를 판단한다.
- DoD 1의 일반 파일 Enter(열기) 테스트는 구현 전에도 통과했다(회귀 방지). 전진 검사는 압축 파일 Enter 테스트였다.
- 풀기가 시작되면 #60의 진행 창이 뜬다(`extract`가 `trackTransfer`를 호출).

## DoD baseline → after
1. `vitest -t "압축 파일 미리보기 Enter"` — 0 tests → 2 passed (압축 파일 Enter 테스트는 구현 전 실패, 일반 파일 테스트는 이미 통과)
2. `grep -n "core.preview.open" docs/05-actions-keybindings.md | grep -c "압축을 푼다"` — 0 → 1
3. 기존 미리보기 테스트와 `tsc` 통과, 전체 vitest 633 통과 / 1 실패(`pdf-preview` 기준선)

## 남은 불확실성
- 실제 앱에서 Enter 후 미리보기가 닫히고 진행 창이 뜨는 흐름의 모양은 직접 확인하지 못했다.
