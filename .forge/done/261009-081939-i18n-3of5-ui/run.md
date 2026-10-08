# 실행 기록 — ui 컴포넌트 문구 이전 (이슈 #32 3/5)

직접 처리했다.

## 조각별 결과
- S1 ui 컴포넌트·App.tsx 문구 이전 — ✅ 그리고 계획 밖으로 넓혔다: `lib/format.ts`(열 제목·상대 날짜), `lib/previewEdit.ts`, `lib/multiRename.ts`, `lib/model`, `lib/office`, `lib/iconUrls.ts`, `state/context.tsx`, `ui/uiContext.tsx`, `bootstrap.tsx`까지 옮겼다(영어 화면 검사가 열 머리글 "이름·크기·수정"을 잡아서). 그 결과 **allowlist가 빈 목록**이 되었다. 4/5의 TS 부분이 끝났다.
- S2 영어 화면 검사 — ✅ `i18n-english-screens.test.tsx` 6건(메인·설정 모든 탭·도움말·액션 패널·작업 큐·새 폴더·삭제 확인·컨텍스트 메뉴·미리보기·파일 찾기)

## 설계 적용
- 모듈 수준 상수는 getter(`get label() { return translate(...) }`)로 바꿔 그릴 때마다 사전을 본다(설정 항목·MASK_HELP·CASES·COLUMN_TITLES·CONTEXT_MENU). 설정 화면의 항목 약 70개는 일회성 스크립트로 `settings.item.<설정키>.title/desc` 키를 만들었다.
- `useT()`는 스토어가 없거나 설정이 일부만 있는 단위 테스트의 가짜 스토어에서도 동작하도록 `useSyncExternalStore`로 바꿨다(windows-paths·model-view-limits가 그런 가짜를 쓴다).
- `Settings`의 "TOML 문법 오류" 판별을 Rust 문구 비교(`message.startsWith`)에서 `warning.line != null`로 바꿨다. Rust가 문법 오류에만 줄 번호를 준다는 가정이고 기존 테스트가 통과한다.
- 액션 필터 `!a.title.includes("(인수:")`는 언어와 무관한 `/\(\S+:/`로 바꿨다.

## 남은 한계(4/5·5/5가 다룬다)
- Rust가 만든 글자는 아직 한국어다: 폴더 미리보기 트리의 "(빈 폴더)", 설정 경고 문구(`Warning.message`), Rust 서비스 오류 문자열. `packages/keybinds`·`packages/actions`가 내는 키 설정 경고 문구도 같다. C3 검사는 `apps/desktop/src`만 훑으므로 이것들은 아직 걸리지 않는다.
- 영어 화면 검사의 미리보기는 파일로 했다(폴더 미리보기는 Rust 글자).

## DoD
1. allowlist `[]`, `i18n-no-hardcoded` 통과 2. `i18n-english-screens` 6건 3. tsc 통과, vitest 실패 파일 기준선 2개(1069건 통과), i18n-keys 통과
