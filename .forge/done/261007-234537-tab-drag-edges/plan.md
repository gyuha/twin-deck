<!-- forge-slug: tab-drag-edges -->
<!-- task: 93 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 탭 끌기의 경계 처리(틈·취소·유실)를 고친다 (리뷰 G)

## Goal / Non-goals
- Goal: 탭 끌기에서 (1) 탭 사이 4px 틈 위에서는 놓일 자리가 맨 끝으로 튀므로 가장 가까운 탭으로 정하고, 끌린 탭이 맨 끝일 때의 이동 거리(shift)도 끌린 탭의 폭 + 틈으로 계산한다 (2) Esc와 창 `blur`로 끌기를 취소할 수 있게 하고 (3) `mousemove`에서 왼쪽 버튼이 이미 떼어져 있으면(`buttons` 비트 0) 끌기를 끝낸다(`mouseup` 유실). `DragLayer`의 취소 방식과 같은 수준이다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- 다른 패널로 탭 이동
- 키보드 탭 이동 단축키
- 탭 모양 변경
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `TabBar.tsx`의 `press`/`move`/`up`. 리뷰에서 기본 밑줄 탭(`flex gap-1`)의 틈에서 `rects.findIndex`가 -1이 되어 마지막 탭으로 가는 것을 확인했다. 기존 `tab-drag-reorder.test.tsx`는 jsdom에 레이아웃이 없어 `laidOut=false` 경로만 탄다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. 신규 `apps/desktop/src/__tests__/tab-drag-edges.test.tsx`(vitest, `getBoundingClientRect`를 스텁해 레이아웃이 있는 상태를 만든다)가 단언한다: (a) 탭 0과 1 사이 틈에서 놓으면 순서가 바뀌지 않고(가장 가까운 탭 기준) 마지막으로 가지 않는다 (b) 첫 탭을 마지막 탭 위에서 놓으면 맨 뒤로 가고, 중간 탭들의 이동 거리(`translateX`)가 끌린 탭 폭 + 틈이다 (c) 끄는 중 Esc를 누르면 놓아도 순서가 그대로이고 변형이 지워진다 (d) 끄는 중 `window` `blur`도 같다 (e) `buttons: 0`인 `mousemove`가 오면 끌기가 끝나고 이후 움직임에 탭이 따라오지 않는다. 구현 전에 (a)(b)(c)(d)(e)가 실패(red)해야 한다.
  2. 기존 `tab-drag-reorder.test.tsx`가 통과한다
  3. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음)

## Work slices
- [ ] S1. 먼저 실패하는 테스트 — completion criterion: DoD 1 구현 전 실패
- [ ] S2. 가장 가까운 탭·shift·Esc·blur·buttons 처리 — completion criterion: DoD 1·2 green (depends: S1)
