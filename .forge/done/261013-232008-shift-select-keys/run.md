# RUN — Shift+PageUp/PageDown/Home/End 범위 선택과 macOS Cmd+↑/↓ (이슈 #51)

작은 작업이라 워크플로 없이 직접 구현했다(비용 대비 효율).

## 작업 조각별 결과
- S1 Shift+PageUp/PageDown/Home/End 범위 선택 — ✅ 계획대로 (`useKeyboard.ts`에서 `shiftMove(±PAGE_SIZE | ±Infinity)`. `clamp`가 끝에 맞춘다)
- S2 macOS `Cmd+↑/↓`·`Cmd+Shift+↑/↓` — ⚠ 계획과 약간 다름: `Cmd+Shift+↑/↓`는 플랫폼을 모르는 `useKeyboard` 안에서 `e.metaKey`로 판정한다(Windows의 Win 키 조합은 OS가 먼저 가져가므로 영향이 없다고 본다, 확인은 못 했다). `Mod+Up/Down`은 mac 전용 기본 키 목록에만 추가.
- S3 키 카탈로그 — ✅ `docs/05-actions-keybindings.md` 128행(`core.move.home/end`)과 151행(Shift+이동 규칙)
- S4 테스트 — ✅ `apps/desktop/src/__tests__/shift-select-keys.test.tsx` 7건

## 계획과 다른 점
- (사용자 피드백 반영) Shift+PageUp/PageDown/Home/End는 도착 항목까지 포함해 선택해야 한다. 반전 방식에 도착 항목을 포함하면 연속 PageDown에서 직전 도착 항목이 다시 해제되므로, 이 키들은 반전 없이 시작~도착(양 끝 포함)을 선택에 더하는 `shiftSelectTo`로 바꿨다. Shift+↑/↓는 기존 반전 방식 그대로. 아래 첫 항목은 이 변경 전의 기록이다(f01·f11 남음 등).
- 반전 규칙 때문에 Shift+PageDown 뒤 Shift+PageUp은 전부 해제되지 않는다(f01·f11이 남음). 기존 Shift+↑/↓와 같은 규칙이라 테스트 기대값을 규칙에 맞췄다(코드는 고치지 않음).

## DoD 기준선 → 결과
- C1 신규 테스트: 없음 → 7 통과 / 0 실패 (`vitest run shift-select-keys --reporter=json`)
- C2 `bun run test`: 기준선에서도 `pdf-preview.test.tsx`(`created[0].text is not a function`) 1건 실패(동일하게 재현, 2회). 변경 후 desktop 1239 통과 / 1 실패(그 1건). 다른 패키지는 전부 통과. → 새 실패 0, 기존 실패 1
- C3 `bun run typecheck`: 기준선에서도 `packages/actions/src/actions.test.ts(14,65)` 오류 1건(`cursorIsArchive` 누락, 이 작업과 무관). 변경 후 동일 1건, desktop·나머지 패키지는 오류 없음. → 새 오류 0, 기존 오류 1
- C4 mac 기본 키: 테스트 `Cmd+↑/↓ 기본 키는 macOS에만 있다` 통과 (`defaultBindingsFor` 직접 확인)
- C5 문서: `grep -c "Shift+PageDown\|Shift+Home" docs/05-actions-keybindings.md` 0 → 1

## 한계
- 실제 macOS WKWebView에서 `Cmd+↑/↓`·`Cmd+Shift+↑/↓`가 앱까지 오는지는 자동 검사로 확인하지 못했다(Tauri 메뉴 단축키가 먼저 가져갈 가능성).
- C2·C3는 이 작업과 무관한 기존 실패 때문에 "전체 통과·오류 없음"을 글자 그대로는 만족하지 못한다.
