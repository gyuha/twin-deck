# 실행 기록 — 번역 틀 (이슈 #32 1/5)

직접 처리했다(직렬 의존). 

## 조각별 결과
- S1 사전·`t()`·언어 상태·`behavior.language`·설정 화면 항목 — ✅. `i18n/{ko,en,index,locales}.ts`, `useT()`(context), store가 `setLanguage`로 동기화. 설정 키는 td-config `ENUMS`에 `ko|en`
- S2 액션 제목·도움말·팔레트·Action Bar·네이티브 메뉴 — ✅. 액션 제목 124개(짧은 이름 포함)를 `action.<id>`로 사전화하고 `actionTitle/actionShortTitle` 헬퍼로 표시. `appMenu.ts`의 `FILE_MENU`·`VIEW_TOGGLES`는 `text` 대신 `key`(사전 키)를 가진다
- S3 검사 테스트와 allowlist — ✅. allowlist 초기 43개 파일

## 설계 결정(2~5/5가 따른다)
- 컴포넌트는 `const t = useT()`(언어가 바뀌면 다시 그려짐), 컴포넌트 밖 코드는 모듈 `t`(store가 언어를 동기화). 설정 항목처럼 모듈 수준 상수는 getter로 `translate(...)`를 호출해 그릴 때마다 사전을 본다.
- 한국어 값은 원문 그대로, 키 형식 `영역.이름`, 매개변수는 ASCII 이름의 `{name}`.
- C3 검사는 `apps/desktop/src`만 훑는다. `packages/`(액션 메타의 한국어 제목, ts-client의 fake)는 제외한다. 액션 제목은 사전이 덮어쓰고(`i18n-keys.test`가 모든 액션 ID의 사전 항목을 요구) 메타의 제목은 플러그인 액션의 대체 제목으로만 남는다.

## DoD
1. `i18n-keys.test.ts` 7건 통과(없음 → 통과). 2. `i18n-no-hardcoded.test.ts` 2건. 3. `i18n-setting.test.tsx` 1건, app-menu 17→18건. 4. tsc 통과, vitest 실패 파일 기준선 2개(1060건 통과), cargo test 78건·clippy 통과, 바인딩 최신

## 벗어난 것
- 계획은 테스트를 먼저 red로 만들라고 하지 않았다(tdd off). 테스트와 구현을 함께 만들었다.
