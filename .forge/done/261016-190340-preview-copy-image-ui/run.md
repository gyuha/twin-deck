<!-- forge-slug: preview-copy-image-ui -->
# 실행 기록 — 이미지 미리보기에 복사 버튼과 Mod+C를 더한다 (이슈 #88, 2/2)

## 조각별 결과
- S1 테스트 먼저, 수정 전 빨강 확인 — ✅ as planned (7개 중 5개 실패, 2개는 음의 단언이라 통과)
- S2 액션 `core.preview.copy`(`Mod+C`, `preview` 범위)·핸들러·`store.previewCopyImage/previewCopy` — ✅ as planned
- S3 `Preview.tsx` 이미지 복사 버튼, `preview.copy_image` 번역 — ✅ as planned (기존 텍스트 복사 버튼 한 개를 두 용도로 공유: 아이콘·`copied` 표시·타이머 재사용)
- S4 `docs/05`·`docs/07` — ✅ as planned
- (추가) 액션 제목 사전 항목 `action.core.preview.copy`(ko·en) — ⚠ 계획에 없었다. 전체 vitest의 `i18n-keys.test.ts`("등록된 모든 액션 ID가 두 언어의 제목을 가진다")가 잡았다.

## 수정 전 빨강 증거 (S1)
`bunx vitest run src/__tests__/preview-copy-image.test.tsx` (수정 전): `5 failed | 2 passed`.
- 실패 5, 이유는 의도한 그대로: 이미지 미리보기에 "이미지 복사" 버튼 없음(`toBeInTheDocument`), 버튼을 눌러도 `copiedImages`가 `[]`, `Ctrl+C`로도 `[]`, 실패 주입 때 알림이 비어 있음(`''`), 텍스트 미리보기에서 선택 후 `Ctrl+C`가 `copyText`를 부르지 않음.
- 통과 2: 텍스트 미리보기에서 `Ctrl+C`가 `copyImage`를 부르지 않음 / 선택이 없으면 아무것도 복사하지 않음 — 음의 단언이라 수정 전에도 통과하는 것이 정상(회귀 방지용).
- **솔직한 주석**: "선택한 글자를 Mod+C로 복사" 테스트의 수정 전 빨강은 "기존 동작이 있었는데 깨졌다"가 아니다. 기존에는 브라우저 기본 복사가 시스템 클립보드로 직접 복사했고 jsdom은 그것을 흉내 내지 않는다. 이 테스트는 **새 액션이 키를 가로채면서 선택 복사를 대신 해 주는 것**을 고정한다.

## DoD 기준값 → 실행 후
1. 새 테스트 7개 → 수정 전 5 빨강 → 수정 후 7개 초록. 기존 `preview-copy-button.test.tsx` 10개도 통과.
2. 양의 단언: 이미지 미리보기에 버튼이 있고 ✕와 같은 줄·아이콘(글자 없음, `svg`)이며 "텍스트 복사"는 없음, 누르면 `copiedImages == ["/home/a/a.png"]`와 `data-copied="true"`(1.5초 뒤 해제), `Ctrl+C`도 같음(텍스트 클립보드는 비어 있음).
3. 음의 단언: 텍스트 미리보기에는 "이미지 복사" 버튼이 없고(`텍스트 복사`만), `Ctrl+C`가 `copyImage`를 호출하지 않으며, 선택이 있으면 `copyText`가 그 글자를 받고 없으면 아무것도 복사하지 않는다.
4. 실패: `copyImageError`를 주면 `role=alert`에 사유가 보이고 `data-copied`가 켜지지 않으며 `copiedImages`가 비어 있다.
5. `grep -c "core.preview.copy" docs/05-actions-keybindings.md` 0 → 1 · `grep -c "이미지 복사" docs/07-ui-spec.md` 0 → 1.
6. 전체: `bun run test` 통과(desktop 169 파일 통과·1 건너뜀, 1440 통과) · `bunx tsc --noEmit` exit 0 · `cargo test --workspace` 562 통과·실패 0 · `cargo clippy -p twin-deck-desktop -- -D warnings` 경고 없음 · `cargo fmt --check` 통과.

## 결정과 발견
- **`Mod+C` 가로채기의 대가**: `useKeyboard`는 바인딩이 해석되면 먼저 `preventDefault()`를 부른다. 그래서 미리보기에서 `Mod+C`를 이 액션에 묶으면 브라우저 기본 복사가 막히고, 같은 액션이 선택한 글자를 `backend.copyText(selection.toString())`로 복사한다. **행동 변화**: 렌더링된 마크다운처럼 서식이 있는 본문을 선택해 복사하면 예전에는 브라우저가 서식(HTML)까지 클립보드에 넣었지만 이제는 일반 글자만 들어간다. 편집 상자(`data-preview-edit`) 안에서는 `useKeyboard`가 키를 처리하지 않아 기본 복사가 그대로다.
- 이미지 복사 버튼은 이미지가 실제로 표시될 때만 보인다(`d.dataUrl`이 있고 3D·Office가 아닐 때). 너무 커서 `dataUrl`이 없는 이미지에는 버튼도, `Mod+C`의 이미지 복사도 없다(이 경우 `Mod+C`는 선택 글자 복사로 떨어지고 선택이 없으면 아무 일도 하지 않는다).
- 새 액션을 더하면 `docs/05`뿐 아니라 사전의 액션 제목(`action.<id>`)도 필요하다. 전체 vitest 전에는 알 수 없었다.

## 검증하지 못한 것
- 실제 macOS·Windows 클립보드에 이미지가 들어가는지, 다른 앱에서 붙여 넣으면 보이는지(1/2에서 이어짐).
- 실제 앱의 `Mod+C`가 정말 `keydown`으로 웹뷰에 도달해 이 액션이 실행되는지. 코드에 네이티브 Copy 메뉴 항목이 없고 기존 파일 복사 `Mod+C`도 같은 경로라서 도달한다고 판단하지만(신뢰도 높음) 직접 눌러 보지는 못했다.
- 렌더링된 마크다운 선택 복사가 일반 글자로 바뀐 것이 사용자에게 문제가 되는지.
