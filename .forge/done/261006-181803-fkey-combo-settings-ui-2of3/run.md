# 실행 기록 — F키 설정 화면의 조합키 항목 추가·삭제

## 슬라이스 결과
- S1 설정의 조합키 키를 F키 탭 줄로 표시 — ✅ 계획대로 (`Settings.tsx`가 `config.fkeys`에서 `+`가 든 키를 줄로 만듦)
- S2 "추가" 버튼, F키 선택, Mod/Ctrl/Alt/Shift 체크박스 — ✅ 계획대로 (`FKeyAdder`)
- S3 줄 삭제 — ✅ 계획대로 (조합 줄은 "기본값으로" 대신 "삭제", `fkeys`·`fkey_apps` 함께 제거)

## DoD baseline → after
1. `fkey-combo.test.tsx` — 파일 없음 → 5개 `it(` 통과 (FakeBackend 설정 값 저장 확인)
2. 같은 F키 다른 조합 2개 + 중복 차단 — 통과
3. 삭제 시 `fkeys`/`fkey_apps` 제거 — 통과
4. `settings.test.tsx` 15건 통과(탭 목록 포함), 복원 테스트 통과
5. `tsc --noEmit` 종료 0

## 판단·발견
- `FakeBackend.resetConfigValue`가 기본값 없는 키를 `undefined`로 남겨서 `Object.keys`에 그대로 보였다. 실제 백엔드(키 삭제)와 맞추려고 `setPath`가 `undefined`면 키를 지우게 고쳤다(계획 밖 변경, 테스트 대역만 해당).
- 계획에 없던 Rust 테스트 `fkey_combo_round_trips_through_user_config` 추가: 실제 `set_user_value`/`reset_user_value`가 조합키를 저장·삭제하는지 확인.
- F키 선택은 Radix Select 대신 기본 `<select>`를 썼다(테스트에서 조작하기 쉽고 항목이 12개뿐).
- 새 조합 항목은 빈 문자열("")로 만들어진다. 빈 값은 "기본값 유지"라 동작을 고르기 전에는 아무 바인딩도 만들지 않는다.
