# 실행 기록 — F키 "Action Bar에 표시" 체크와 Action Bar 노출

## 슬라이스 결과
- S1 td-config `fkey_bar`(키→bool, 기본 F1~F12 false) + `default.toml` + `task gen-types` — ✅ 계획대로. 조합키 키는 `merge.rs`에서 불리언 값도 받도록 넓혔다.
- S2 F키 설정 줄마다 "Action Bar" 스위치 — ✅ 계획대로 (`Settings.tsx`, 스위치 aria-label `<키> Action Bar에 표시`)
- S3 `ActionBar.tsx`가 켠 줄을 기존 구성 뒤에 이어 붙이고 클릭 시 인수와 함께 실행 — ✅ 계획대로 (`fkeyBarItems`를 `lib/fkeys.ts`에 두고 UI는 렌더만)
- S4 문서 — ✅ `docs/05-actions-keybindings.md` 5.7절에 `[fkey_bar]` 설명 추가

## DoD baseline → after
1. `cargo test -p td-config fkey_bar` — 테스트 없음 → 통과(기본 꺼짐·라운드트립·잘못된 키/값 경고 3건). red 상태는 `fkey_bar` 필드가 없던 구현 전엔 컴파일조차 되지 않아 자명하다(⚠ 따로 실행하진 않음).
2. `up_to_date` 통과 (gen-types 후 bindings.ts·default-config.json 갱신)
3. `fkey-action-bar.test.tsx` — 파일 없음 → 6개 통과: 켠 줄만 노출, 순서(단독 F키 → 조합키), 기본값/해제 줄 처리, 클릭 실행, 앱 경로 인수, 설정 스위치→저장→바 반영
4. `action-bar.test.tsx` 수정 없이 통과 (사전 통과 — 회귀 방지)
5. 스위치 → `fkey_bar.F2`가 FakeBackend 설정에 저장 — 통과
6. `tsc --noEmit` 종료 0
7. `grep -c fkey_bar docs/05-actions-keybindings.md` 0 → 1

## 판단·발견
- 동작이 "기본값"(빈 문자열)인 줄은 내장 바인딩(`defaultBindingsFor`의 pane 스코프)에서 액션을 찾는다. 기본 구성에 이미 있는 인수 없는 액션(예: F5 복사)은 중복이라 붙이지 않는다 — 계획에 없던 판단이며 문서에도 적었다.
- F8을 "해제"하면 기본 휴지통 버튼의 키 표기가 사라진다(키맵 기준). 테스트 기대값을 이에 맞췄다.
- 이슈 #16의 "즐겨찾기 노출": F키(예: F9)에 `core.menu.favorites`를 걸고 스위치를 켜면 바에 나온다. 즐겨찾기 메뉴 자체는 건드리지 않았다.
