# 실행 기록 — 탭 위치 옵션 2/2: 탭 막대를 패널 하단에 그리기·테스트·문서 (이슈 #67)

fg-loop 구동 중 직접 실행했다(tdd off).

## 슬라이스별 결과
- S1 `Pane.tsx`: `tab_position === "bottom"`이면 `TabBar`를 파일 목록·터미널 영역 뒤에 그림(DOM 순서, 위쪽 `DriveBar`는 그대로). `TabBar.tsx`: 하단이면 막대 `border-t`, `underline` 활성 탭 `border-t-2` — ⚠ 첫 구현에서 상단 클래스 문자열의 항목 순서가 바뀌어 기존 회귀 방어 테스트 `pane-tab-appearance`가 실패했다. 상단은 이전과 똑같은 문자열이 되도록 고쳤다.
- S2 `tab-position.test.tsx` 9건 — ✅ 계획대로(위치 DOM 순서, 기본값, underline·segments 클래스, 새 탭 수·활성 탭). `Pane`의 하단 처리를 임시로 끄면 하단 위치 테스트가 실패하고 되돌리면 통과함을 확인했다.
- S3 `docs/06`(`behavior.layout` 예시)·`docs/07`(탭 설명) — ✅ 계획대로.

## DoD baseline → after
1. `tab-position.test.tsx`: 파일 없음 → 9 passed.
2. `grep -c tab_position docs/06 docs/07`: 0·0 → 1·1.
3. `tsc` 통과, vitest 전체 1331건 통과(159 파일). 기존 `pane-tab-appearance`(기본값 클래스 동일) 포함.

## 계획과 다른 점
- 상단 클래스 문자열 순서를 원래대로 되돌려야 했다(계획에는 없던 수정). 기존 회귀 방어 테스트가 잡았다.

## 알려진 한계
- jsdom 단언이다. WKWebView에서의 겉모양(경계선·강조선 느낌)은 확인하지 못했다.
