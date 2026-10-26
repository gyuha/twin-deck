<!-- auto-retro: fg-loop -->
# 2026-10-26 — 폴더 트리가 활성 패널의 드라이브(SFTP·FTP·SMB 포함)를 따라 보인다 (이슈 #134)

## Plan vs actual
- 계획대로 된 것: S1(`FolderTree.tsx` 뿌리를 활성 패널의 드라이브로, 새 시험 6개를 먼저 써서 수정 전 컴포넌트에서 red 확인 → 구현 → green)·S2(docs/05·06, i18n ko/en 설명). 전체 시험 1662개 통과, 타입 오류 없음.
- 어긋난 것: 시험의 `node()` 헬퍼가 `[data-tree-path="Z:\share"]` 속성 선택자에서 `\`를 CSS 이스케이프로 읽어 Windows 경로 노드를 못 찾았다(컴포넌트는 정상). 속성값을 직접 비교하도록 헬퍼를 고쳤다. FakeBackend가 `/` 경로만 다뤄서 Windows 드라이브 시험은 `listDir`을 시험 안에서 덮어썼다.

## Learnings
- 다음에 다르게 할 것: Windows 경로(`\` 포함)를 `data-*` 속성 선택자로 찾는 시험은 선택자 대신 `dataset` 값을 직접 비교한다. 새 시험이 "노드 없음"으로 실패하면 컴포넌트보다 선택자부터 의심한다(이번에는 실제 DOM에 행이 있었다).
- 검증 한계: 실제 SFTP/FTP 서버, Windows `Z:\` 네트워크 드라이브, WKWebView 화면에서는 확인하지 못했다. Windows에서 SMB 폴더가 안 보이던 실제 원인은 추정이며 이 변경(뿌리를 경로에서 정함)이 그 증상을 없애는지 실제 환경에서 확인해야 한다.
- 이 드라이브가 자동 선택한 결정(run.md `## Rulings`): 워크플로 없이 직접 실행, TDD는 플랜 기본(off)이되 S1은 시험 먼저.

## Doc updates
- 검토 전(auto retro) — 승급 없음. CONTEXT.md/ADR/eval 승급은 fg-learn 배치에서 사람이 판단한다.
