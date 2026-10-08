<!-- forge-slug: i18n-1of5-core -->
<!-- task: 118 -->
<!-- part: 1/5 -->
<!-- tdd: off -->
# 번역 틀을 만든다: 사전·t()·언어 설정·액션 제목·메뉴 (이슈 #32 1/5)

## 목표 / 하지 않을 것
- 목표: 한국어·영어 사전(`apps/desktop/src/i18n/{ko,en,index,locales}.ts`)과 `t(key, params?)`(키는 ko 사전에서 추론한 타입), 언어 상태(store)와 훅, 설정 키 `behavior.language`(`"ko"|"en"`, 기본 `"ko"`, td-config·default.toml·gen-types), 설정 화면의 언어 선택(`ui/Settings.tsx`, 바로 반영·저장), 액션 제목(`action.<id>` 키, 팔레트·도움말·Action Bar가 `t`로 표시), 네이티브 메뉴 항목(`appMenu.ts`)이 `t`를 쓰게 한다. 새 언어는 사전 파일 하나와 `locales.ts` 등록으로 추가된다. 한글이 남은 파일을 추적하는 검사(`__tests__/i18n-no-hardcoded.test.ts` + `i18n/allowlist.json`)와 사전 검사(`i18n-keys.test.ts`)를 만든다. allowlist는 지금 한글이 있는 화면 소스 파일 전체로 시작해 2~5/5가 줄여 간다.
- 하지 않을 것: README·docs 번역, 새 언어 추가, Rust 로직 변경(화면에 보이는 오류를 오류 종류로 바꾸는 것만 4/5에서 허용), 기존 테스트 기대값 약화(기존 테스트는 한국어 기본으로 그대로 통과해야 한다)

## 기준 문서
- 용어: 새 용어 없음. 관련 ADR: 없음(되돌리기 쉬운 문구 작업, 설계는 1/5의 run.md에 기록)
- 이 계획은 `.forge/loop.md`(이슈 #32 목표 계약)의 구성 작업이다. 공통 약속: 사전 키는 `영역.이름` 형태이고 한국어 사전(`i18n/ko.ts`)이 원본이다. 영어 사전(`i18n/en.ts`)에는 한글을 쓰지 않는다. 문구를 옮길 때 한국어 값은 **원래 문장 그대로**(기존 테스트가 이를 비교한다), 영어는 자연스러운 UI 영어로 쓴다. 매개변수는 중괄호 자리표시자를 쓴다.
- 완료 정의(DoD):
  1. `i18n-keys.test.ts`: ko·en 키 집합 동일, 값 비어 있지 않음, en 값에 한글 없음, 등록된 모든 액션 ID가 두 언어 제목을 가짐. 사전 상태: 파일 없음 → 앞으로 가는 확인.
  2. `i18n-no-hardcoded.test.ts`: 화면 소스의 한글 문자열 파일 목록 == allowlist(정확히 일치, 한글 없는 파일이 목록에 있으면 실패). 사전 상태: 파일 없음.
  3. `i18n-setting.test.tsx`: `behavior.language` 기본 ko, 설정 화면에서 English를 고르면 즉시 설정 화면·도움말 제목이 영어가 되고 저장됨, 다시 ko. 네이티브 메뉴 테스트(`app-menu.test.ts`)에 영어 단언 추가.
  4. 회귀: `bunx tsc --noEmit`, `bunx vitest run` 실패 파일 기준선 2개, `cargo test -p twin-deck-desktop`(바인딩·기본 설정 최신 포함)·clippy 통과

## 작업 조각
- [ ] S1. 사전·`t()`·언어 상태·`behavior.language`(Rust 설정+gen-types)·설정 화면 항목 — 완료 기준: DoD 3의 설정 테스트 green
- [ ] S2. 액션 제목·도움말·팔레트·Action Bar·네이티브 메뉴를 `t`로 — 완료 기준: DoD 1 액션 항목과 메뉴 영어 단언 green (depends: S1)
- [ ] S3. 두 검사 테스트와 allowlist 초기 목록 — 완료 기준: DoD 1·2 green, DoD 4 통과 (depends: S2)
