<!-- forge-slug: context-menu-copy-path -->
<!-- task: 127 -->
<!-- tdd: off -->
# 파일 컨텍스트 메뉴에 경로 복사 (이슈 #43)

## 목표 / 하지 않을 것
- 목표: 파일 행 우클릭 메뉴에 `경로 복사`(기존 액션 `core.path.copy_files`, `Mod+F12`)를 추가한다. 대상(선택 또는 커서)의 경로를 줄바꿈으로 이어 복사한다.
- 하지 않을 것: 새 액션·키, 폴더 경로 항목, 클립보드 동작 변경.

## 기준 문서
- 관련 ADR·용어: 없음. 완료 정의(DoD): `.forge/loop.md`의 C1~C4.

## 작업 조각
- [ ] S1. `CONTEXT_MENU`에 `경로 복사` 추가, i18n ko/en — 완료 기준: C1·C3
- [ ] S2. 테스트(`context-menu.test.tsx`)와 문서, 회귀 — 완료 기준: C1~C4 (depends: S1)
