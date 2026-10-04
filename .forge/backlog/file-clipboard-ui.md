<!-- forge-slug: file-clipboard-ui -->
<!-- task: 47 -->
<!-- part: 2/2 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# Cmd(Ctrl)+C/X/V 파일 복사·잘라내기·붙여넣기 동작

## Goal / Non-goals
- Goal: 파일 목록에서 Mod+C는 선택 항목(없으면 커서 항목)을 OS 파일 클립보드에 쓰고, Mod+X는 같은 일을 하되 "잘라내기" 표시(앱 안에 경로 집합을 기억)를 남기며, Mod+V는 클립보드의 파일을 활성 패널의 현재 폴더로 붙여 넣는다. 잘라내기 표시한 경로 집합과 클립보드의 파일 목록이 같으면 이동(붙여 넣을 때 원본 이동), 아니면 복사로 처리한다. 이름이 겹치면 기존 충돌 창(+ 남은 항목에 적용 체크 박스)을 쓴다. 진행은 기존 작업 큐와 진행 창을 따른다. 클립보드에 파일이 없으면 오류 없이 알림만 띄운다. 입력창 안의 Mod+C/X/V는 글자 복사에만 쓰이고 파일 클립보드를 건드리지 않는다.
- Non-goals: 드래그 앤 드롭, 이미지·텍스트 클립보드, Windows 정밀 DropEffect.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `apps/desktop/src/__tests__/file-clipboard.test.tsx`(새 파일, 8개 이상)가 통과한다: 복사 후 붙여 넣기(원본 유지), 잘라내기 후 붙여 넣기(원본 이동, 붙여 넣기 전에는 그대로), 다중 선택·선택 없음(커서 항목), 충돌 창, 외부에서 온 파일 목록, 빈 클립보드 알림, 같은 폴더 붙여 넣기 충돌, 입력창 안의 Ctrl+C가 파일 클립보드를 건드리지 않음. Cmd(mac)와 Ctrl 키 모두. 전체 vitest(기존 `pdf-preview` 1건 제외)·`tsc`·`packages/actions` 테스트·`cargo test --workspace`·fmt·clippy가 통과한다.

## Work slices
- [ ] S1. `packages/actions`에 액션(`core.clipboard.copy`/`cut`/`paste`)과 기본 키 Mod+C/X/V(pane 범위)를 추가하고 `docs/05-actions-keybindings.md`의 키 표를 갱신한다 — completion criterion: `packages/actions` 테스트가 통과하고 Mod+C/X/V가 pane 범위에서 해당 액션으로 해석된다
- [ ] S2. store에 `clipboardCopy`/`clipboardCut`/`clipboardPaste`를 추가한다. 붙여 넣기는 `copyOrMove`의 충돌 처리·큐 등록을 재사용하도록 "경로 목록과 목적 폴더"를 받는 공통 함수로 뽑아 쓰되 기존 동작을 바꾸지 않는다 — completion criterion: 기존 vitest가 그대로 통과하고 새 동작이 file-clipboard.test.tsx에서 통과한다 (depends: S1)
- [ ] S3. `file-clipboard.test.tsx` 작성(8개 이상, mac/Ctrl 모두) — completion criterion: 모두 통과 (depends: S2)
