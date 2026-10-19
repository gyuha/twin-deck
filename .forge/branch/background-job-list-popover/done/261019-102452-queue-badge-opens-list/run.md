# RUN — 백그라운드 작업 뱃지를 누르면 작업 목록과 진행률을 보여 준다

- S1 배지를 `button`으로 만들어 클릭 시 `api.toggleQueue()` 호출 — ✅ as planned (`role="status"` 래퍼 유지, 기존 시험 무회귀)
- S2 팝업 행에 `role="progressbar"` 진행률 막대 + ko/en `queue.job_progress_aria` — ✅ as planned

## 이탈·메모
- 워크플로 없이 직접 실행(작은 작업). 새 worktree에 `node_modules`가 없어 `bun install`을 먼저 했다.
- 첫 구현에서 `s.api`로 접근해 전부 실패 → `useAppStore()`의 `api`로 고침(다른 컴포넌트 관례).
- DoD baseline → after: 배지 클릭 시험 0 → 1 통과(구현 전 red 확인), 진행률 막대 시험 0 → 1 통과(구현 전 red), 전체 vitest 1545 통과 유지(회귀 가드), `tsc --noEmit` 0 유지.
- 눈으로(WKWebView) 확인하지는 않았다. 시험은 jsdom 기준이다.
