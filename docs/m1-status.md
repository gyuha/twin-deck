# M1(P0) 구현 상태

2026-09-29 기준. 근거는 각 행의 테스트 파일이며, 모두 로컬 macOS(Darwin 25)에서 실행한 결과다. Windows/Linux에서는 실행하지 않았다 `[알 수 없음]`.

## P0 항목

| ID | 상태 | 검증 테스트 | 비고 |
|---|---|---|---|
| PANE-01 | done | apps/desktop/src/__tests__/navigation.test.tsx | Tab으로 활성 패널 전환, 활성 패널은 테두리(`data-active`)로 구분 |
| PANE-02 | done | apps/desktop/src/__tests__/navigation.test.tsx | 탭마다 경로/커서/선택/이력 보유. 표시 모드·정렬은 M2 |
| PANE-04 | done | apps/desktop/src/__tests__/navigation.test.tsx | 새 탭, 닫기, 다음/이전. 마지막 탭은 닫기 액션이 비활성(docs/07은 홈으로 이동으로 정의, Marta 동작 미확인) |
| NAV-01 | done | apps/desktop/src/__tests__/navigation.test.tsx | PageUp/Down은 10행 단위(화면 높이 미반영) |
| NAV-03 | done | apps/desktop/src/__tests__/navigation.test.tsx | Enter/Backspace/`..` 더블클릭. `..`는 커서 대상이 아닌 별도 버튼 |
| NAV-12 | done | apps/desktop/src/__tests__/navigation.test.tsx | 조각 클릭으로 이동 |
| SEL-01 | done | apps/desktop/src/__tests__/navigation.test.tsx | Mod+A, Esc |
| SEL-02 | done | apps/desktop/src/__tests__/navigation.test.tsx | Shift+↑/↓만 지원(반전 방식). `extend` 전환 설정은 M2 |
| SEL-05 | done | apps/desktop/src/__tests__/navigation.test.tsx | 부분 일치 기본값. 정규식 입력 없음. IME 조합 중 입력은 무시하므로 실제 한글 IME 타이핑은 검증하지 못했다 |
| OP-01 | done | apps/desktop/src/__tests__/file-ops.test.tsx | 중첩 경로. Rust: crates/td-ops/tests/ops.rs |
| OP-02 | done | apps/desktop/src/__tests__/file-ops.test.tsx | 0바이트 파일 |
| OP-03 | done | apps/desktop/src/__tests__/file-ops.test.tsx | 충돌 3종(덮어쓰기/건너뛰기/이름 바꿈)을 항목마다 묻는다. "모두에 적용"은 없다. Rust: crates/td-ops/tests/ops.rs |
| OP-04 | done | apps/desktop/src/__tests__/file-ops.test.tsx | rename 실패 시 복사 후 삭제로 폴백(다른 볼륨 이동은 실제로 검증하지 못했다) |
| OP-05 | done | apps/desktop/src/__tests__/file-ops.test.tsx | 대화상자 방식. 확장자를 뺀 부분이 선택된 상태로 열린다. 행 안 인라인 편집은 아님 |
| OP-06 | done | apps/desktop/src/__tests__/file-ops.test.tsx | 확인 없이 실행. Rust 테스트는 fake 휴지통만 검증하고 `SystemTrash`(OS 휴지통)는 실행하지 않았다 |
| OP-07 | done | apps/desktop/src/__tests__/file-ops.test.tsx | 확인 대화상자(Return 확정, Esc 취소) |
| OP-17 | done | apps/desktop/src/__tests__/navigation.test.tsx | Windows/Linux Ctrl+H, macOS Cmd+Shift+. |
| ACT-02 | done | packages/actions/src/actions.test.ts | 컨텍스트 조건(선택/커서/탭 수/상위 가능)으로 활성 판정 |

## 종단 시나리오

- 키보드만: apps/desktop/src/__tests__/keyboard-scenario.test.tsx — 폴더 이동 → 선택 → 복사 → 이동(충돌 처리) → 이름 변경 → 휴지통 → 영구 삭제. 백엔드는 인메모리 `FakeBackend`다.
- 실제 디스크: crates/td-ops/tests/scenario.rs — 같은 흐름을 tempdir에서 실행.

## docs/11 M0/M1 완료 기준 대조

| 기준 | 결과 |
|---|---|
| `just dev`가 3개 OS에서 창을 띄운다 | 미검증. `just`가 로컬에 없고 창 실행과 Windows/Linux는 확인하지 못했다 |
| `just check`, `just test`가 CI 3개 OS에서 통과 | CI 파이프라인 파일이 없다. 같은 명령(`cargo fmt/clippy/test`, `bun run typecheck/test/build`)은 로컬 macOS에서 통과 |
| 이식한 두 크레이트의 원본 테스트 통과 | 해당 없음. 이식하지 않고 자체 구현했다(`td-watch`, `td-ops`) |
| 웹뷰 키 입력 실험 표(F5~F8, Ctrl/Cmd+W, F11, F12) | 없음. 실제 웹뷰에서 실험하지 못했다 |
| 마우스 없이 시나리오 완료(3개 OS) | macOS jsdom + 인메모리 백엔드에서만 확인 |
| 다른 프로그램에서 파일이 바뀌면 목록 갱신 | Rust 감시 테스트(`watch_external_change`)와 UI 갱신 테스트를 각각 통과. 두 계층을 실제 Tauri 런타임으로 잇는 왕복은 테스트하지 않았다 |
| 이름 충돌 시 처리 | 통과 |
| 한글 파일 이름(NFD) 정렬과 Quick Select | Rust(`nfd_korean_sort`, `nfd_korean_quick_select`)와 UI 테스트 통과 |
| P0 미완료 항목의 목록과 사유 | 위 표 — 미완료 항목 없음, 한계는 비고에 기록 |

## 알려진 한계

- `TauriBackend`(실제 command/event 호출)는 타입 검사만 통과했고 Tauri 런타임에서 호출해 보지 않았다.
- 목록은 가상 스크롤이 아니다. 대용량 디렉터리는 M2 벤치마크 대상이다.
- `core.select.toggle`(Space/Insert)은 docs/05 카탈로그에 없는 자체 액션이며, M2에서 미리보기가 Space를 쓰면 재배정이 필요하다.
