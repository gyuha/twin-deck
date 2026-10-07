# RUN — 탭 끌기의 경계 처리(틈·취소·유실)를 고친다 (리뷰 G)

- S1 red 테스트 — ✅ `tab-drag-edges.test.tsx` 6건(`getBoundingClientRect`를 스텁해 폭 50·80·60, 틈 4px 레이아웃을 만든다). 구현 전 5건 실패: 틈에서 맨 끝으로 튐, 맨 끝 탭의 이동 거리 84(≠64), Esc·blur·buttons 0 취소 없음. 맨 앞 탭 이동 거리(54)는 사전 통과(가드)
- S2 구현 — ✅ 놓일 탭은 탭 위면 그 탭, 틈·바깥이면 가장 가까운 탭. shift = 끌린 탭 폭 + 틈. Esc(캡처 단계)·창 blur·`mousemove`의 `buttons === 0`에서 취소(순서 불변, 남은 mouseup이 뒤처리)

## DoD baseline → after
1. 6건: 5 red → 통과
2. 기존 `tab-drag-reorder` 5건 통과, `pane-tab-appearance` 통과

## 차이·메모
- 기존 `tab-drag-reorder.test.tsx`의 `move` 헬퍼에 `buttons: 1`을 더했다. 실제 브라우저의 끄는 동안 `mousemove`는 항상 버튼이 눌려 있는데(`buttons: 1`) jsdom 기본값은 0이라, 새 "버튼이 떼어졌으면 끝낸다" 규칙에서 헬퍼가 비현실적이었다. 단언은 바꾸지 않았다.
- 탭 줄 밖(세로)에서 놓는 경우는 다루지 않았다(리뷰의 별도 지적, 범위 밖).
- 실제 앱에서 틈·취소를 눈으로 확인하지 못했다(스텁한 레이아웃 기준).
