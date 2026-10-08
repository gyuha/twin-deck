# 실행 기록 — 텍스트 미리보기 복사 버튼 (이슈 #38, 1/2)

fg-loop 드라이브 중 한 세션에서 직접 처리했다. TDD(`tdd: on`).

## 조각별 결과
- S1 실패하는 테스트 — ✅ `preview-copy-button.test.tsx` 9건(구현 전 8건 실패, 바이너리에는 버튼이 없다는 1건은 원래 통과하는 회귀 방지).
- S2 복사 동작 — ✅ 스토어 `previewCopyText`(읽기 완료 상태의 텍스트만 `backend.copyText`). "복사됨"은 컴포넌트 상태로 1.5초 유지.
- S3 제목 줄 버튼과 선택 — ✅ ✕ 왼쪽에 `텍스트 복사` 버튼(`aria-label`), 64KB 초과면 `title`에 "앞부분만 복사됩니다". 본문에 `select-text`. 계획과 달리 읽는 중(`fresh`가 아닐 때)에는 버튼을 숨겼다(이전 파일의 텍스트를 복사하는 오류 방지, 계획에 없던 조건).
- S4 문서 — ✅ `docs/07-ui-spec.md` §8.

## DoD (baseline → after)
1. `preview-copy-button.test.tsx`: 파일 없음 → 9건 통과 (8건은 구현 전 실패)
2. tsc: 통과 → 통과. vitest 실패: 기준선 4건 → 같은 4건, 새 실패 0건. 통과 978 → 987
3. Rust·ts-client diff: 비어 있음 → 비어 있음 (회귀 방지)
4. `grep -c "텍스트 복사" docs/07-ui-spec.md`: 0 → 1
5. 실제 앱 확인: **미실시** (선택 후 Cmd+C, 복사 버튼 붙여넣기, 버튼 모양·위치)
