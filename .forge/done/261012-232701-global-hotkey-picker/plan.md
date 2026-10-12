<!-- forge-slug: global-hotkey-picker -->
<!-- task: 141 -->
<!-- tdd: off -->
# 전역 화면 열기 단축키 입력을 수식키 체크 + 키 선택 상자로 바꾼다

## Goal / Non-goals
- Goal: 설정 > 환경의 "전역 화면 열기 단축키"(`environment.global_hotkey`)를 텍스트 입력 칸 대신 F키 조합 추가 칸(`FKeyAdder`)과 같은 모양으로 입력한다. `Mod`·`Ctrl`·`Alt`·`Shift` 체크 넷과 키 선택 상자 하나다. 선택 상자는 "(없음)", A~Z, 0~9, F1~F12를 담는다. 체크나 선택을 바꾸면 바로 저장하고 단축키를 다시 등록한다(설정 화면의 다른 항목과 같다).
  - 저장 형식은 그대로 `Mod+Alt+O` 문자열이다(수식키는 `Mod, Ctrl, Alt, Shift` 순서, 키는 맨 뒤). 설정 구조체·`default.toml`·bindings는 바꾸지 않으므로 `gen-types`가 필요 없고 이미 저장된 값도 그대로 읽힌다.
  - 글자·숫자 키는 수식키가 1개 이상이어야 저장한다. 수식키 없이 글자·숫자를 고르면 저장하지 않고 안내 문구를 보인다. F1~F12는 수식키 없이도 저장한다.
  - "(없음)"을 고르면 빈 문자열로 저장해 단축키가 꺼진다(기존 "비우면 끈다"와 같다). 값이 비었거나 목록에 없는 값(예: 파일을 직접 고친 `Mod+Alt+Space`)이면 선택 상자는 "(없음)"으로 보이고, 목록에 없는 값은 옆에 `현재 값: <원문> (목록에 없음)`으로 보여 준다. 사용자가 새로 고르기 전에는 저장된 값을 바꾸지 않는다.
  - "전역 화면 열기 단축키 사용" 스위치를 끄면 체크·선택 상자가 모두 비활성화된다(지금 텍스트 칸이 비활성화되는 것과 같다).
- Non-goals: 키를 눌러서 입력받는 녹화 방식, A~Z·0~9·F1~F12 밖의 키(Space·방향키 등) 선택지, 저장 형식·설정 키 이름 변경, 전역 단축키 등록 로직(`global_hotkey.rs`) 변경, F키 조합 추가 칸 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 관련 코드: `apps/desktop/src/ui/Settings.tsx`(`SECTIONS`의 `environment.global_hotkey` 항목 :173, 컨트롤 렌더 :495~, `FKeyAdder` :307), `apps/desktop/src/i18n/ko.ts`·`en.ts`, `apps/desktop/src/__tests__/global-hotkey-setting.test.tsx`(지금 textbox 기준이라 새 컨트롤에 맞게 고쳐야 한다)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/global-hotkey-setting.test.tsx`가 통과하고, 이 파일이 새 컨트롤을 실제 동작으로 단언한다: (a) `Mod`·`Alt` 체크와 키 `O`를 고르면 `config.toml`의 `environment.global_hotkey`가 `Mod+Alt+O`가 된다(체크 순서와 상관없이 `Mod, Ctrl, Alt, Shift` 순서), (b) 수식키 없이 `O`를 고르면 값이 바뀌지 않고 안내 문구가 보이며 `F5`는 수식키 없이도 `F5`로 저장된다, (c) "(없음)"을 고르면 값이 빈 문자열이 되고 이어서 키를 고르면 다시 저장된다, (d) 목록에 없는 값(`Mod+Alt+Space`)이 있으면 `현재 값: Mod+Alt+Space (목록에 없음)`이 보이고 고르기 전에는 값이 그대로다, (e) 사용 스위치를 끄면 체크 넷과 선택 상자가 비활성이고 켜면 다시 활성이다. 사전 상태(실행 확인함): 이 파일은 지금 textbox 기준 테스트 3개가 통과한다. 새 컨트롤 단언(a~e)은 아직 없으므로 S3에서 새로 쓰고, 새 단언이 옛 textbox 화면에서는 실패하는지(red)를 한 번 확인한 뒤 green으로 만든다.
  2. 설정 화면의 다른 테스트가 깨지지 않는다: `cd apps/desktop && bunx vitest run src/__tests__` 전체 통과. 단 `pdf-preview.test.tsx`(Blob URL 해제)와 `model-formats.test.ts`(`occt-import-js.wasm` 없음)는 이 변경과 무관한 기존 실패라 제외하고 본다.
  3. `cd apps/desktop && bunx tsc --noEmit`이 0으로 끝난다.
  4. `git diff --stat`에 `crates/`, `apps/desktop/src-tauri/`, `packages/ts-client/src/generated/`가 없다(저장 형식·bindings를 안 건드렸다는 회귀 확인. 사전 상태: 변경 없음이라 이미 충족, 작업 중 실수로 건드리지 않았는지 보는 장치다).
  5. 새 문구는 `ko.ts`·`en.ts`에 같은 키로 들어간다: `grep -c "settings.hotkey" apps/desktop/src/i18n/ko.ts`와 `en.ts`의 값이 같고 ≥1이다(사전 상태 0 확인 필요).
  6. `settings.item.environment.global_hotkey.desc`가 새 입력 방식에 맞게 고쳐졌다: 더 이상 "예: Mod+Alt+O"를 직접 입력하라고 하지 않고 "비우면 끕니다" 대신 "(없음)을 고르면 끕니다"를 말한다(ko·en 둘 다).
  7. README.md·README.en.md·`docs/`에서 전역 화면 열기 단축키를 입력 방식까지 설명한 곳이 있으면 같이 고친다: `grep -n "global_hotkey" README.md README.en.md docs/*.md`로 찾은 줄을 확인한다(README 두 파일은 한 쌍이라 같은 커밋에서 맞춘다). 실제 앱에서 화면을 눈으로 확인하지는 못하므로 run.md에 "확인 못함"으로 적는다.

## Work slices
- [ ] S1. `Settings.tsx`에 전역 단축키 전용 컨트롤을 만든다. 저장 문자열을 (수식키 집합, 키)로 풀고 다시 문자열로 합치는 작은 함수와, `FKeyAdder`와 같은 체크 넷 + 선택 상자 UI를 쓴다. `SECTIONS`의 `environment.global_hotkey` 항목을 새 컨트롤 종류로 바꾸고 렌더 분기에서 사용 스위치(`hotkeyOff`)와 연동해 비활성화한다. 수식키 규칙·(없음)·목록에 없는 값 표시를 넣는다 — completion criterion: DoD 1(a~e), 3.
- [ ] S2. `ko.ts`·`en.ts`에 새 문구(안내·`(없음)`·`현재 값`·`목록에 없음`)를 더하고 `global_hotkey.desc`를 고친다 — completion criterion: DoD 5, 6. (depends: S1)
- [ ] S3. `global-hotkey-setting.test.tsx`를 새 컨트롤에 맞게 다시 쓰고 전체 vitest를 돌린다. 문서에 입력 방식 설명이 있으면 README 한·영 쌍과 `docs/`를 같이 고친다 — completion criterion: DoD 1, 2, 4, 7. (depends: S1)
