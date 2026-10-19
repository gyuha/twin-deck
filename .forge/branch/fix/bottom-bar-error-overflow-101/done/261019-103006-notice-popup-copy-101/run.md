# RUN — 하단 오류 메시지 레이아웃 고정과 클릭 시 복사 팝업 (이슈 #101)

- S1 `status-notice.test.tsx` 먼저 작성 — ✅ 구현 전 3건 모두 실패(red) 확인
- S2 상태 바 notice를 잘리는 버튼으로, 오른쪽 묶음 `shrink-0`, 클릭 시 info 다이얼로그에 전체 문구 + 복사 버튼, i18n ko/en — ✅ 3건 통과(green)

## DoD baseline → after
1. status-notice 시험 3건: 0(파일 없음) → 3 통과 (forward check, red→green)
2. 전체 vitest: 통과 유지(185 파일 1546건) · tsc 오류 0 (회귀 방지, 사전에도 통과)
3. WKWebView 실제 배치: 미확인 — jsdom은 배치를 계산하지 않아 클래스(`truncate min-w-0` / `shrink-0`)로만 단언함.

## 발산·메모
- 새 다이얼로그 종류 대신 기존 `info`에 `copyText?`를 추가했다(작은 변경).
- 알림 요소가 `role="alert"`인 `<button>`이라 버튼 역할이 alert로 덮인다(시험이 alert로 찾음).
- 첫 전체 실행에서 2건 실패는 수정 전의 새 시험 1건 + 일시적 실패 1건이었고, 재실행에서 모두 통과.
