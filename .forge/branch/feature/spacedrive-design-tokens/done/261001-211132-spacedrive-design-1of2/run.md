# 실행 기록 — Spacedrive 디자인 토큰 적용과 테마 8종 (part 1/2)

실행 방식: 워크플로우 없이 메인 세션에서 직접 실행 (조각 4개). TDD on — S2/S3는 실패하는 테스트를 먼저 썼다. 브랜치 `feature/spacedrive-design-tokens`, 커밋하지 않았다.

## 조각별 결과
- S1 tokens 설치, index.css import, theme.css 다크 덮어쓰기 제거 — ✅ 계획대로 (빌드 통과, 결과 CSS에 테마 7종과 `--color-app-box` 포함, `--color-neutral-500` 없음 확인)
- S2 테마 값 8종, 기본 system, default-config.json 재생성, `<html>` 테마 클래스 — ✅ 계획대로 (Rust 2개, vitest 9개 빨강 → 초록)
- S3 컴포넌트 색 교체, 커서·선택 B안, 테마 가드 교체 — ⚠ 계획 밖 판단 2건: ① DoD 1의 정규식이 `text-white`/`bg-black/NN`까지 금지했지만 tokens가 `--color-white`/`--color-black`을 정의하므로 허용했다 ② 가드가 `ui/`와 `App.tsx`만 봐서 `bootstrap.tsx`의 `text-red-700`을 놓쳤고, 가드를 src 최상위 `.tsx`까지 넓혔다(넓힌 가드가 고치기 전 상태를 잡는 것을 확인)
- S4 THIRD_PARTY_NOTICES, docs/03, docs/04, docs/06 갱신 — ✅ 계획대로

## DoD (baseline → after)
1. 기본 팔레트 + 흰/검정 정규식 — 64 → 8. 남은 8곳은 모두 `text-white`(accent 위 글자 2곳)와 `bg-black/20·30`(모달 뒤 어둡게 5곳)이다. tokens가 정의하는 고정 색이라 의도적으로 남겼다. 숫자 붙은 기본 팔레트만 세면 64 → 0.
2. `@spacedrive/tokens` in package.json — 0 → 1
3. `theme = "system"` in default.toml — 0 → 1
4. `cargo test -p td-config theme_accepts_spaceui_themes` — 0개 실행 → 1 passed
5. `bun run --cwd apps/desktop test -- theme -t "spaceui"` — 모두 건너뜀 → 12 passed
6. `cargo test --workspace` — 통과 → 통과 (회귀 방지, 변화 없음)
7. `bun run test` — desktop 271 → 280 통과 (낡은 다크 덮어쓰기 가드 3개 제거, 새 테스트 12개)
8. typecheck/fmt/clippy — 0 → 0 (회귀 방지)
9. `cargo test -p twin-deck-desktop up_to_date` — 통과 → 통과 (`default-config.json` 재생성 후)
10. 실제 앱 UAT — 미실시 (시각 판단, 사용자 확인 필요)

## 계획 대비 차이·판단
- **시각 확인 화면의 설명 오류**: fg-ask에서 B안을 "지금 방식 계승(왼쪽 막대)"이라고 설명했지만, 실제 파일 목록 커서는 지금도 파란색으로 채우는 방식이었다(`FileTable.tsx`의 `bg-blue-600 text-white outline`). 왼쪽 막대는 Actions Panel·큐·팝업 메뉴 선택 행의 방식이었다. 사용자가 고른 B안의 모양(은은한 배경 + accent 왼쪽 막대) 그대로 적용했다. 즉 파일 목록 커서는 눈에 띄게 바뀐다.
- 선택 항목은 `font-bold`에서 `font-semibold text-accent`로 바뀌었다(B안).
- 행에 3px 왼쪽 테두리를 두어 커서 막대가 생겨도 열이 밀리지 않게 하고, 컬럼 머리글에도 같은 폭의 투명 테두리를 넣었다.
- 매핑: 흐린 글자 → `ink-faint/ink-dull`, 테두리 → `app-line`, 모달 표면 → `app-box`, Action Bar 배경 → `app-dark-box`, 진행 막대 바탕 → `app-slider`, 선택 행 → `app-selected` + `accent`, 오류/성공/경고 → `status-*`.
- spaceui 글자 크기 체계(`text-sm` 0.8rem 등)가 그대로 적용되어 전체 글자가 조금 작아진다(계획대로).
- 미확인: 실제 앱에서 테마별 대비와 가독성. 빌드 결과에 클래스가 들어간 것만 확인했다.
