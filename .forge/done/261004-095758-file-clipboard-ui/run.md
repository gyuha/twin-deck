# RUN — Cmd(Ctrl)+C/X/V 파일 복사·잘라내기·붙여넣기 동작 (file-clipboard-ui)

워크플로 없이 직접 실행했다(작은 작업).

- S1 `core.clipboard.copy/cut/paste` 액션과 기본 키 Mod+C/X/V(pane), `docs/05-actions-keybindings.md` 키 표, `actions.ts` 핸들러 — ✅ 계획대로
- S2 store: `copyOrMove`의 충돌 처리·큐 등록을 `runTransfer`로 뽑아 재사용(기존 동작 유지), `clipboardCopy/Cut/Paste` — ✅ 계획대로
- S3 `file-clipboard.test.tsx` 11개(mac Cmd와 Ctrl 모두) — ✅ 계획대로

## DoD baseline → after
- file-clipboard.test.tsx: 0개 → 11개 통과
- vitest 전체: 504 통과·실패 1 → 515 통과·실패 1(기존 `pdf-preview`), `tsc` 오류 없음, actions 19·ts-client 47 통과
- `cargo test --workspace`·fmt·`clippy -p twin-deck-desktop` 통과
- 실제 앱(격리 인스턴스, macOS): Cmd+C → 클립보드에 파일 URL(`osascript`로 `/tmp/cbt/one.txt` 확인), 반대 패널에서 Cmd+V → `dst/one.txt` 생성

## 어긋난 점
- 잘라낸 파일을 원래 폴더에 붙여 넣는 경우(할 일 없음)와 클립보드 파일이 없는 경우의 알림 문구를 계획에 적지 않았는데 테스트에 포함했다.
- 실제 앱 확인에서 `CGEvent`로 보낸 Cmd 키는 앱에 닿지 않았고(앱이 비활성), 앱을 최전면으로 올리고 System Events의 keystroke로 보내야 했다. 전면 앱이 대상일 때만 보내도록 막았다.
- 확인하려고 `bun run dev`(Vite)를 잠시 띄웠다가 껐다. 사용자가 `tauri dev`를 쓰고 있지 않아 1420 포트가 비어 있었다.
- 한 번 불필요한 `git stash; git stash pop`을 실행했다. 작업 트리는 그대로였다.
