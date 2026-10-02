# RUN — 다중 이름 바꾸기 도구
slug: multi-rename

## 슬라이스 결과
- S1 순수 함수(`buildNewNames`, `validateNames`, `needsTempStep`) — ✅ 계획대로 (`lib/multiRename.ts`, 단위 테스트 18개)
- S2 다이얼로그 상태·UI·액션·진입점 — ✅ 계획대로 (`ui/MultiRename.tsx`, `store.ts`의 `multiRename`/`dialogMultiRename*`, `core.rename.multi`, Shift+F6 분기, 화면 테스트 13개)
- S3 전체 회귀 확인 — ✅ 계획대로

## DoD baseline → after
- DoD 1 `multi-rename-names.test.ts` / `multi-rename.test.tsx`: 파일 없음 → 18개 / 13개 통과. 맞바꾸기 테스트는 임시 이름 단계를 끄면 실패하는 것을 확인(변이 확인).
- DoD 2 웹 테스트 345개 → 376개 통과, `tsc` 0, `cargo test --workspace` 실패 0, `packages/actions` 19개 통과
- DoD 3 실제 앱 UAT: 사람 확인 필요

## 결정·차이
- 다중 이름 바꾸기는 기존 다이얼로그 인프라(`ask`/`dialogConfirm`)에 새 kind `multirename`으로 얹었다. 입력은 다이얼로그 상태에 두고, 새 이름·오류는 화면과 저장소가 같은 순수 함수로 계산한다.
- 충돌은 실행 전에 막는다(행별 오류 + 버튼 비활성). 선택 안의 맞바꾸기·연쇄 변경은 오류가 아니며, 새 이름이 다른 변경 행의 옛 이름과 겹치면 전부 임시 이름(`.td-rename-<시각>-<번호>`)을 거친다. 중간 실패 시 되돌리지 않고 실패 항목·이유를 알린다. 2단계 중 두 번째 단계가 실패하면 파일이 임시 이름으로 남을 수 있어 그 사실도 알린다.
- 날짜 토큰, 프리셋, 구성, 로그 결과, 되돌리기는 범위 밖으로 두었다.
- 폴더 안의 숨김 파일은 목록에 없으면 충돌 검사에서 보이지 않는다. 그 경우는 백엔드 `rename`의 AlreadyExists 오류가 실패 항목으로 알려 준다.
