# run — 전역 화면 열기 단축키 입력을 수식키 체크 + 키 선택 상자로 바꾼다

워크플로 없이 직접 실행했다(화면 한 곳을 고치는 작은 작업이라 서브에이전트 비용이 더 크다).

## 슬라이스별 결과
- S1 `Settings.tsx`에 `hotkey` 컨트롤(`HotkeyControl`, `parseHotkey`)을 더하고 `environment.global_hotkey` 항목에 연결 — ✅ 계획대로
- S2 `ko.ts`·`en.ts`에 `settings.hotkey.*` 문구 3개를 더하고 `global_hotkey.desc`를 새 방식에 맞게 고침 — ✅ 계획대로
- S3 `global-hotkey-setting.test.tsx`를 새 컨트롤 기준으로 다시 쓰고 README 한·영 쌍에 입력 방식을 적음 — ⚠ `docs/06-config-plugins.md`는 값 형식 설명이 그대로 맞아 고치지 않음

## 계획과 달랐던 점
- 계획의 DoD 1(c)는 "(없음) 뒤에 키를 고르면 다시 저장된다"였다. 구현은 (없음)을 골라도 수식키 체크를 남겨 두므로 `F1`을 고르면 `Mod+Alt+F1`이 저장된다. 이 동작이 더 자연스러워 테스트를 그렇게 썼다.
- `HotkeyControl`은 네이티브 `<select>`와 `<input type="checkbox">`를 써서 `FKeyAdder`와 같은 모양이다.

## DoD baseline → after
1. `global-hotkey-setting.test.tsx`: 3개 통과(textbox 기준) → 7개 통과. 새 테스트는 옛 화면에서 6 failed / 1 passed(red, 나머지 하나는 무관한 `single_instance` 테스트)였고 새 화면에서 7/7 green.
2. 전체 `vitest run src/__tests__`: 1209개 중 1208 통과. 실패는 이번 변경과 무관한 `pdf-preview.test.tsx`(Blob URL 해제)와 `model-formats.test.ts`(`occt-import-js.wasm` 없음)뿐이다.
3. `bunx tsc --noEmit`: 0 → 0.
4. `git diff --stat`에 `crates/`·`src-tauri/`·`generated/` 없음: 이미 충족, 작업 후에도 유지(회귀 확인).
5. `settings.hotkey` 개수 ko 0 → 3, en 0 → 3.
6. `global_hotkey.desc`: "예: Mod+Alt+O … 비우면 끕니다" → 체크·선택 방식과 "(없음)을 고르면 끕니다"로 고침(ko·en).
7. README.md·README.en.md 고침, `docs/06-config-plugins.md`는 유지. 실제 앱에서 화면을 눈으로 확인하지는 못했다.

## 확인하지 못한 것
- 실제 Tauri 앱의 설정 화면(WKWebView)에서 보이는 모양과, 바꾼 단축키가 실제로 다시 등록되는지는 확인하지 못했다. vitest(FakeBackend)로만 확인했다.

## 추가 변경과 검증 (UAT)
- 확인 중 요청에 따라 `Mod` 표시를 바꿨다: macOS는 `Cmd`, Windows·Linux는 `Mod` 체크를 숨기고 `Ctrl`만 보인다(전역 단축키 칸과 F키 조합 추가 칸). 도움말 문구와 README 한·영도 고쳤다. 이 변경은 아직 커밋하지 않았다.
- 사용자가 실제 앱에서 "잘 동작 함"으로 확인했다. 이전의 "확인하지 못한 것"(실제 앱 화면)은 해소됐다. 단축키 재등록으로 창이 불려 오는지는 별도로 확인했다는 말이 없었다.
