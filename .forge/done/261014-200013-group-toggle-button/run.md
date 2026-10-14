# 실행 기록 — 상태 표시줄에 "묶어보기" 토글 버튼 추가 (이슈 #69)

fg-loop 구동 중 직접 실행했다(tdd off).

## 슬라이스별 결과
- S1 `state/store.ts`에 `toggleGroupByModified`(설정 `behavior.table.group_by_modified`를 뒤집어 저장) — ✅ 계획대로.
- S2 `App.tsx` 상태 표시줄 `숨김 파일` 바로 뒤에 `viewToggle`로 `묶어보기` 버튼, ko/en 문구(`status.group`·`status.group_aria`) — ✅ 계획대로. 새 액션이 없어 `viewToggle`의 `actionId`는 빈 문자열로 넘겼다(키가 없으면 title만 보인다).
- S3 `group-toggle-button.test.tsx` 4건 — ⚠ 영어 테스트를 처음에는 영어 설정으로 렌더했더니 `renderApp` 도우미가 한국어 목록 이름을 기다리다 실패했다. 한국어로 렌더한 뒤 `backend.setConfigValue("behavior.language", …)`로 바꾸는 기존 방식으로 고쳤다.
- S4 `docs/07-ui-spec.md` 35행 문장에 새 버튼을 적음 — ✅ 계획대로.

## DoD baseline → after
1. `group-toggle-button.test.tsx`: 파일 없음 → 4 passed.
2. `grep -c status.group ko.ts en.ts`: 0·0 → 2·2.
3. `tsc` 통과, vitest 전체 1335건 통과(160 파일; 기존 `app-status-buttons`·`i18n-keys`·`settings` 포함).
4. `grep -c 묶어보기 docs/07`: 0 → 1.
5. `up_to_date` 2건 통과, `clippy -p td-config` 통과(회귀 방어, 이미 통과 상태).

## 계획과 다른 점
- 없음(영어 테스트 렌더 방식만 위와 같이 고침).

## 알려진 한계
- jsdom 단언이다. 실제 앱(WKWebView)에서의 겉모양(간격·켜짐 색)은 확인하지 못했다.
