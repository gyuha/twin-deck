# RUN — F키 설정을 키맵에 반영하고 앱 실행·도움말 액션 추가 (fkeys-keymap-help)

실행 방식: 메인 세션에서 직접 실행(Dynamic Workflow 없음, `running.md` 없음).

## 슬라이스별 결과
- S1 `core.app.launch` 액션·핸들러·`api.launchApp` — ✅ 계획대로. 인수에 `key`를 함께 싣도록 확장(안내 메시지가 "F3에 지정된 애플리케이션이 없습니다"처럼 키 이름을 말하려면 필요). 계획의 인수는 `app` 하나였다
- S2 `config.fkeys` → 사용자 바인딩 병합 — ✅ 계획대로. 순수 함수 `lib/fkeys.ts`의 `fkeyBindings`로 분리하고 `App.tsx`에서 `[...fkeyBindings, ...loaded.bindings]` 순서로 병합(파일이 이긴다)
- S3 `core.help`·`core.help.close`·`help` 스코프·`Help.tsx`·기본 키 F1 — ✅ 계획대로 (`Scope`에 `help` 추가, 모달 스코프 등록, `core.help.close`는 Esc/F1)
- S4 전체 회귀 확인 — ✅ 계획대로

## DoD baseline → after
1. `fkey-bindings.test.tsx`: 없음 → T1~T8, T11, T12 10개 모두 통과 (전진). T5는 2개 선택 시 둘 다 전달됨을 단언.
2. T5~T7이 `FakeBackend.launched`의 `{app, paths}`를 직접 단언.
3. 회귀 방지(사전 통과 → 그대로): typecheck 0, `cargo test --workspace` 0, vitest 430 passed·실패는 기존 pdf-preview 1건. 기존 테스트의 기대값은 고치지 않았다.
4. `grep -n '"F1"' packages/actions/src/defaults.ts`: 결과 없음(0) → 바인딩 2줄(전진).

## 발견한 것
- 테스트에서 `{Space}`는 userEvent 키 이름이 아니라 공백 문자로 입력해야 한다(기존 테스트는 `" "`). 선택 토글 뒤 커서가 한 칸 내려간다.
- `core.help`를 `pane` 스코프로 둬서 모달(설정·다이얼로그)이 열린 동안에는 F1이 도움말을 열지 않는다.
- T9, T10(설정 화면)은 작업 31에서 같은 파일에 추가한다.
