# 실행 기록 — "업데이트 확인" 액션과 설치 확인 대화상자

## 슬라이스 결과
- S1 액션 등록과 핸들러 — ✅ `core.app.check_update`("업데이트 확인", 기본 키 없음, 스코프 `global`), `actions.ts`에서 `api.checkForUpdate()` 연결
- S2 스토어 `checkForUpdate()` — ✅ 확인 → 새 버전이면 `confirm` 창(버전 + 릴리스 노트 8줄까지) → 설치. 진행 중 재실행은 `updateBusy`로 무시. 오류는 `notice`, 안내는 `flash`로 낸다.
- S3 문서와 테스트 — ✅ `docs/05` 액션 표에 추가, `update-check.test.tsx` 7건

## DoD baseline → after
1. `update-check.test.tsx` 파일 없음 → 7개 `it(` 통과: 새 버전 + 설치(호출 1번), 취소(0번), 최신 안내, 확인 오류, 설치 오류, 중복 실행(확인 1번), 켜기만 해서는 확인 안 함
2. `grep -c "core.app.check_update"` — defaults.ts·actions.ts·docs 세 파일 모두 1
3. `packages/actions` vitest 19건 통과, F키 열거 테스트 포함 전체 통과
4. `tsc --noEmit` 0, vitest(pdf-preview 제외) 84파일 728건 통과

## 판단·발견
- 계획에 "확인 중임을 알린다"가 있어 `flash`(3초 상단 알림)를 썼다. 네트워크가 3초보다 오래 걸리면 알림이 먼저 사라질 수 있다.
- 설치 중 안내도 `flash`라 3초 뒤 사라진다. 설치가 오래 걸리면 아무 표시가 없어 보일 수 있다(진행률은 Non-goal). 필요하면 후속 작업으로 둔다.
- 도움말(F1) 목록은 키가 걸린 액션만 보여서 새 액션은 거기에 나오지 않는다. 액션 패널(`Mod+Shift+P`)에서 "업데이트"로 찾는다.
