<!-- forge-slug: context-menu-copy-path -->
# 실행 기록 — 컨텍스트 메뉴 경로 복사 (이슈 #43)

## 한 일
- `state/store.ts`의 `CONTEXT_MENU`에 `경로 복사`(기존 액션 `core.path.copy_files`) 추가, `이름 바꾸기` 바로 아래.
- `i18n/ko.ts`·`en.ts`: `ctx.copy_path` = `경로 복사` / `Copy Path`.
- `__tests__/context-menu.test.tsx`: 항목 목록 기대값에 한 줄 추가, 새 테스트 2개(힌트 `Ctrl+F12`·클릭 시 한 경로 복사, 여러 선택은 줄바꿈 이음).
- `docs/05-actions-keybindings.md`에 컨텍스트 메뉴 항목임을 적음.

## 계획과 실제
- 계획과 같다. 새 액션이나 키는 만들지 않았다(액션이 이미 있었음).

## 검증
- C1·C2: context-menu 17 통과. C3: i18n 3개 파일 통과(영어 라벨은 키 일치 테스트로 확인, 영어 화면에서 메뉴를 열어 보는 테스트는 없음). C4: tsc 통과, vitest 1102 통과·실패는 기준선 2개 파일뿐.
- 실제 앱에서 눈으로 확인하지는 않았다.
