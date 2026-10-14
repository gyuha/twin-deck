# 실행 기록 — 날짜 구간 그룹핑 2/3: 목록에 구간 제목 행과 구간별 정렬 (이슈 #62)

fg-loop 구동 중 직접 실행했다(tdd off).

## 슬라이스별 결과
- S1 구간 순서 배열 — ✅ 계획대로. `state/store.ts`에 `groupingActive`(설정 켜짐 ∧ 실제 폴더 ∧ 목록 보기)와 `groupByModified`(정렬 결과를 구간 순위로 안정 재배열)를 더하고 `reload`·`setOrder`·`setViewMode`에 적용했다. 설정 변경은 기존 `onConfigChanged → reloadAll`이 다시 정렬한다.
- S2 구간 제목 행·가상 스크롤 대응 — ✅ 계획대로. `ui/FileTable.tsx`에서 항목 순서로 `layout`(제목 행 + 항목 행, 항목→행 번호 표)을 만들어 행 수·`scrollToIndex`·렌더를 맞췄다. 제목 행은 `data-group-header`이고 항목(option)이 아니다.
- S3 테스트 — ✅ 계획대로. `date-groups-ui.test.tsx` 7건. 구간 순서·option 수·↑/↓ 건너뜀·끔/여러 열 보기/가상 탭 제외·`groupingActive` 단위.

## DoD baseline → after
1. `date-groups-ui.test.tsx`: 파일 없음 → 7 passed. 렌더를 임시로 막아 보니 2건이 실패했다(테스트가 기능을 본다).
2. `tsc` 통과, vitest 전체 1321건 통과(158 파일).
3. `grep -c data-group-header FileTable.tsx`: 0 → 1.

## 계획과 다른 점
- ⚠ 테스트의 `searchBackend().setConfig(...)`를 체이닝했다가 `tsc`가 `setConfig`는 값을 돌려주지 않는다고 잡았다(vitest는 통과). 변수에 담도록 고쳤다. 검사 C4가 `tsc`를 포함해서 잡혔다.

## 알려진 한계
- 항목 순서는 정렬 시점의 `Date.now()`로, 제목 행은 그리는 시점의 `Date.now()`로 구간을 계산한다. 자정을 넘겨 목록을 다시 읽지 않으면 같은 구간 제목이 두 번 나올 수 있다(다음 다시 읽기에서 바로잡힌다). 실제로 확인하지는 않았다.
- jsdom 단언이다. WKWebView에서의 겉모양(간격·고정 헤더 느낌)은 확인하지 못했다.
