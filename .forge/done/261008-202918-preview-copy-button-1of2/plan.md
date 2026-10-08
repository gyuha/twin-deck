<!-- forge-slug: preview-copy-button-1of2 -->
<!-- task: 111 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 텍스트 미리보기의 선택·복사 — 제목 줄에 복사 버튼 (1/2)

## 목표 / 하지 않을 것
- 목표: 미리보기에서 텍스트를 확실하게 복사할 수 있게 한다. (GitHub 이슈 #38 — "텍스트 선택도 되고 복사도 되면 좋겠다")
  - **복사 버튼**: 텍스트 계열 미리보기(텍스트·코드·마크다운·JSON, 즉 `d.kind === "text"`이고 3D·Office가 아닌 경우)의 **제목 줄, ✕ 바로 왼쪽**에 둔다. 이미지·PDF·오디오·비디오·폴더·기타·3D·Office, 불러오는 중, 오류 상태에서는 보이지 않는다.
  - 누르면 파일의 **원문 텍스트**(마크다운·JSON도 렌더링된 글자가 아니라 원문 `d.text`)를 `backend.copyText`로 클립보드에 넣고, 버튼 글자가 잠깐(약 1.5초) "복사됨"으로 바뀐다.
  - 파일이 64KB를 넘어 앞부분만 보이는 경우(`d.truncated`)는 **보이는 앞부분만 복사되고**, 이때 버튼의 `title`에 "앞부분만 복사됩니다"를 적는다. 전체를 읽어 복사하는 것은 하지 않는다.
  - **선택**: 미리보기 본문에서 마우스 드래그로 텍스트를 선택할 수 있다(본문에 `select-none` 같은 선택 방지가 없고 명시적으로 `select-text`를 둔다). 선택 후 `Cmd/Ctrl+C`는 미리보기 키 범위(`preview`)에서 파일 복사(`core.clipboard.copy`)에 묶여 있지 않아 브라우저의 기본 복사가 동작한다(앱에서 직접 확인은 DoD 5).
- 하지 않을 것: 편집·저장(2/2) · 64KB를 넘는 파일 전체 복사 · 복사용 단축키 추가 · 렌더링된 마크다운 글자 복사 · Rust·바인딩 변경

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음 (새 용어를 만들지 않았다)
- 관련 ADR: 없음
- 관련 이슈: GitHub 이슈 #38
- 갱신할 문서: `docs/07-ui-spec.md` §8(미리보기)
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/preview-copy-button.test.tsx` 통과, 테스트 5건 이상 (사전 상태: 파일이 없어 실패 — 앞으로 가는 확인, TDD의 red). 새 테스트가 확인할 것:
     - 텍스트 파일(`.txt`)·마크다운(`.md`)·JSON·코드(`.rs`) 미리보기에 `텍스트 복사` 버튼이 있고 제목 줄(✕와 같은 줄)에 있다.
     - 이미지·바이너리(`other`)·폴더 미리보기에는 버튼이 없다.
     - 버튼을 누르면 `FakeBackend`의 `clipboard`에 파일 원문이 들어가고(마크다운은 원문 그대로), 버튼 글자가 "복사됨"으로 바뀌었다가 돌아온다.
     - 64KB를 넘는 텍스트 파일은 `title`에 "앞부분만 복사됩니다"가 있고 복사 내용은 보이는 앞부분이다.
     - 미리보기 본문에 `select-none` 클래스가 없고 `select-text`가 있다.
  2. `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run` 의 실패가 기준선 4건(`audio-preview` · `preview-scroll` PDF · `theme` · `theme-colors`)뿐이다. 기존 미리보기 테스트(`preview`, `markdown-preview`, `code-preview`, `json-preview`)는 통과해야 한다. (사전 상태: 같은 4건 — 회귀 방지)
  3. `git diff --stat -- crates apps/desktop/src-tauri packages/ts-client` 가 비어 있다 (UI만, 사전 상태: 비어 있음 — 회귀 방지)
  4. `grep -c "텍스트 복사" docs/07-ui-spec.md` 가 1 이상이다 (사전 상태: 0 — 앞으로 가는 확인)
  5. 실제 앱 확인(자동 테스트가 못 보는 부분): 텍스트 파일을 미리 보고 ① 드래그로 선택한 뒤 `Cmd+C` → 다른 곳에 붙여넣기가 되는지, ② 제목 줄의 복사 버튼을 누르면 붙여넣기가 되는지, ③ 버튼 모양·위치(✕ 왼쪽)가 어색하지 않은지 사람이 본다. 선택·`Cmd+C`가 WKWebView에서 되는지는 jsdom이 확인하지 못한다.

## 작업 조각
- [ ] S1. 실패하는 테스트 작성(red) — `preview-copy-button.test.tsx`에 위 5가지를 쓰고 구현 전에 실패함을 확인한다. — 완료 기준: 구현 전 새 테스트가 실패, 구현 후 모두 통과
- [ ] S2. 복사 동작 — 스토어에 미리보기 원문을 `backend.copyText`로 복사하는 동작(`previewCopyText`)을 더하고 "복사됨" 표시를 잠깐 유지한다. (depends: S1) — 완료 기준: S1의 복사 테스트가 통과한다
- [ ] S3. 제목 줄 버튼과 선택 — `Preview.tsx`의 제목 줄(✕ 왼쪽)에 텍스트 계열에서만 `텍스트 복사` 버튼을 두고, 본문에 `select-text`를 명시한다. (depends: S2) — 완료 기준: DoD 1이 통과하고 기존 미리보기 테스트가 통과한다
- [ ] S4. 문서 — `docs/07-ui-spec.md` §8에 텍스트 복사 버튼·선택·복사 규칙을 적는다. — 완료 기준: DoD 4가 통과한다
