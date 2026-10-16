<!-- forge-slug: preview-copy-image-ui -->
<!-- task: 189 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 이미지 미리보기에 복사 버튼과 Mod+C를 더한다 (이슈 #88 2/2)

## 목표 / 비목표
- 목표: 이미지 미리보기 머리줄에 "이미지 복사" 버튼을 더하고, 미리보기에서 `Mod+C`(Windows·Linux는 `Ctrl+C`)로도 이미지를 클립보드에 복사한다. 복사하면 버튼 아이콘이 잠깐 체크로 바뀐다(기존 텍스트 복사 버튼과 같은 표시). 실패하면 오류 알림을 띄운다.
- 비목표: 백엔드(1/2, `preview-copy-image-backend`에서 끝남), 설정 키, 텍스트 외 종류의 복사, 이미지가 너무 커서 미리보기가 표시를 포기한 경우의 복사.

## 근거(코드로 확인한 사실)
- `ui/Preview.tsx:115` `showCopy = fresh && d?.kind === "text" && !model && !office`, `:164-190` 텍스트 복사 버튼(`api.previewCopyText()`, `copied` 상태, `data-copied`, 체크 아이콘). 이미지 미리보기는 `:230-236`에서 `d.dataUrl`로 그린다.
- `state/store.ts:2589` `previewCopyText()`는 `backend.copyText`를 쓰고 실패하면 `fail(e)`로 알림을 띄운다. 같은 모양으로 `previewCopyImage()`를 만든다.
- `Mod+C`는 `pane` 범위에만 있다(`packages/actions/src/defaults.ts:221` `core.clipboard.copy`). 미리보기(`preview` 범위) 바인딩 목록은 `:270-281`이다.
- **함정**: `ui/useKeyboard.ts`는 키가 바인딩으로 해석되면 먼저 `e.preventDefault()`를 부른다. 그래서 `preview` 범위에 `Mod+C`를 묶으면 텍스트 미리보기에서 선택한 글자를 복사하던 기본 동작이 막힌다. 같은 액션이 이미지면 이미지 복사, 아니면 **선택한 글자를 `backend.copyText`로 복사**하도록 해서 동작을 보존한다(선택이 없으면 아무것도 하지 않는다).
- 앱 메뉴에 네이티브 Copy 항목이 없어(`PredefinedMenuItem` 없음) 기존 `Mod+C`도 `keydown`으로 처리된다. 새 키도 같은 경로다.

## 원천(Source of truth)
- 용어: 없음
- 관련 ADR: 없음
- 관련 이슈: #88 (2/2 — 화면과 키. 이슈 닫기는 사용자가 정한다)
- 완료 정의(DoD): `.forge/loop.md`의 C3·C4·C5. 구체적으로:
  1. `apps/desktop/src/__tests__/preview-copy-image.test.tsx`가 있고 **수정 전 코드에서 빨강임을 먼저 실행해 `run.md`에 남기며**, 수정 후 초록이다(red → green).
  2. 양의 단언: 이미지 파일에서 미리보기를 열면 이름이 "이미지 복사"인 버튼이 있다. 누르면 `FakeBackend.copiedImages`가 그 파일 경로를 받고 버튼에 `data-copied="true"`가 잠깐 켜진다. 미리보기에서 `Mod+C`를 눌러도 같다(`{Control>}c{/Control}`, 이 테스트 환경의 플랫폼에 맞는 수식키).
  3. 음의 단언: 텍스트 미리보기에는 "이미지 복사" 버튼이 없고(텍스트용 "텍스트 복사"만), 텍스트 미리보기에서 `Mod+C`는 `copyImage`를 호출하지 않으며 선택한 글자가 있으면 `copyText`가 그 글자를 받는다. 선택이 없으면 `copyText`도 호출되지 않는다.
  4. 실패: `FakeBackend`가 `copyImage`를 거부하게 하면 `role=alert` 알림이 뜨고 `data-copied`는 켜지지 않는다.
  5. `grep -c "core.preview.copy" docs/05-actions-keybindings.md` ≥ 1, `grep -c "이미지 복사" docs/07-ui-spec.md` ≥ 1.
  6. 전체 회귀: `bun run test`, `cd apps/desktop && bunx tsc --noEmit`, `cargo test --workspace`, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cargo fmt --check` 통과. 기존 "모든 기본 액션이 연결되어 있다" 테스트(`file-ops.test.tsx`)가 새 액션 핸들러 누락을 잡으므로 통과해야 한다.

## 작업 조각(Work slices)
- [ ] S1. `preview-copy-image.test.tsx`를 먼저 쓰고 현재 코드에서 **실패함을 실행해 확인**한다(실패 이유가 "버튼이 없음"·"`copiedImages`가 비어 있음"인지 확인하고 `run.md`에 기록). 이미지 파일을 `FakeBackend`에 심을 때 미리보기가 이미지 종류로 열리는지(`dataUrl`) 기존 이미지 미리보기 테스트를 따라 맞춘다. — 완료 기준: 새 단언이 수정 전에 빨강이고, 음의 단언은 수정 전에도 통과하는 것은 회귀 방지용이라 정상임을 `run.md`에 적는다.
- [ ] S2. `defaults.ts`에 액션 `core.preview.copy`(제목 "미리보기: 복사", `preview` 범위)와 바인딩 `Mod+C`를 더하고, `actions.ts`에 핸들러를, `store.ts`에 `previewCopyImage()`와 `previewCopy()`(이미지면 이미지 복사, 아니면 선택한 글자 복사)를 더한다. — 완료 기준: 키 단언(S1)이 초록, "모든 기본 액션이 연결되어 있다" 테스트 초록. (depends: S1)
- [ ] S3. `Preview.tsx`에 이미지 복사 버튼을 더한다(이미지가 실제로 표시될 때만; 아이콘·`copied` 표시는 텍스트 복사 버튼과 같게). `i18n`에 `preview.copy_image`(ko "이미지 복사", en "Copy image") 키를 ko·en 모두 더한다. — 완료 기준: 버튼 단언(S1)이 초록. (depends: S2)
- [ ] S4. `docs/05-actions-keybindings.md`에 `core.preview.copy`와 `Mod+C`(미리보기 범위)를, `docs/07-ui-spec.md`의 미리보기 절에 이미지 복사 버튼·`Mod+C`와 한계(실제 OS 클립보드 반영은 사람이 확인)를 한 줄씩 쓴다. — 완료 기준: DoD 5의 grep이 통과. (depends: S3)
