# RUN — 수식키를 누르고 있으면 활성 패널 탭에 번호 배지 표시 (이슈 #153)

변경이 작아(TabBar 한 곳 + 시험 1개 + 문서 한 줄) Workflow 없이 이 세션에서 직접 실행했다(fg-loop 구동 중).

## 조각별 결과
- S1 `TabBar.tsx`에 `useTabNumberHint`(수식키만 0.4초 누르면 true, 다른 키·수식키 변화·blur에 해제, mac `Cmd` / 그 밖 `Ctrl+Shift`)와 `<kbd data-tab-number>` 배지(활성 패널, 탭 2개 이상, 1~8 + 마지막=9, 다이얼로그·메뉴·미리보기·설정이 열려 있으면 숨김)를 추가, `tab-number-hint.test.tsx` 8개 — ✅ as planned
- S2 `docs/05-actions-keybindings.md` `core.tab.goto` 줄에 배지 설명 — ✅ as planned
- ⚠ 계획에 없던 수정: `apps/desktop/src/i18n/rust.ts` `RUST_INTERNAL`에 끌기 로그 문구 5개 추가. DoD 2(전체 vitest)를 막던 main의 기존 실패(`i18n-rust-messages.test.ts`, 커밋 8b06538 `네이티브 끌기의 시작·결과·오류를 로그로 남긴다`가 추가한 `commands.rs` 로그 문구)를 고쳤다.

## 계획과 실제의 차이
- 시작할 때 DoD baseline을 따로 돌리지 않았다. 전체 vitest가 main에서 이미 1건 실패한다는 것을 첫 UAT 뒤에 알았다(`git stash` 후 같은 시험이 실패함을 확인).
- 배지가 보이는 중에 숫자를 누르면 배지는 사라진다(숫자도 "다른 키"로 본다). 탭은 바뀐다.

## Failed attempts
- 1: DoD 2 전체 vitest 1 failed(`i18n-rust-messages.test.ts`, 이번 변경과 무관한 main의 기존 실패) / `RUST_INTERNAL`에 끌기 로그 문구 5개 추가 → 재검증 통과

## DoD baseline → after
- DoD 1 `vitest run src/__tests__/tab-number-hint.test.tsx`: 파일 없음(전방 검사) → 8 passed
- DoD 2 `vitest run` 전체: (main 기준) 1 failed | 1672 passed → 197 files, 1673 passed, 1 skipped
- DoD 3 `tsc --noEmit`: 통과 → 통과(회귀 보호)
- DoD 4 `grep -n "core.tab.goto" docs/05-actions-keybindings.md`: 배지 설명 없음 → 176행에 배지 설명 있음
- 실제 앱(WKWebView)에서는 확인하지 못했다.

## Rulings
- 실행 방식: Workflow 대신 이 세션에서 직접 실행(작은 변경)
- TDD: config 기본값(off)
- 숫자를 눌러도 배지를 숨김(숫자 키도 "다른 키"로 처리, 가장 단순한 규칙)
- 기존 main 실패(i18n 대응표)를 이 브랜치에서 같이 고침(C2가 "전체 통과"이고 고침이 허용 범위 안)
