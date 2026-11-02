<!-- auto-retro: fg-loop -->
# 2026-11-02 — 탭 번호 배지 (이슈 #153)

## 계획 대비 실제
- 계획대로 된 것: S1·S2 모두 들어갔다. `ActionBar.tsx`의 수식키 감지 방식을 따라 TabBar 안에서 끝났고, 바인딩·설정·Rust 변경은 없다.
- 차이: 전체 vitest가 main에서 이미 1건 실패하고 있었다(`i18n-rust-messages.test.ts`). 끌기 로그 문구 5개를 `RUST_INTERNAL`에 넣어 고쳤다.

## 배운 것
- 다음에 다르게 할 것: 프로모션 때 DoD baseline(특히 전체 vitest)을 먼저 돌린다. 이번에는 건너뛰어서 기존 실패를 UAT 뒤에야 알았다.
- AGENTS.md의 "vitest는 전체 통과" 기준선이 커밋 8b06538 이후로 맞지 않았다. Rust에 한국어 로그 문구를 넣는 커밋은 `RUST_INTERNAL`이나 `RUST_MESSAGES`도 같이 고쳐야 한다.

## 문서 갱신
- 검토 안 함(자동 회고)
