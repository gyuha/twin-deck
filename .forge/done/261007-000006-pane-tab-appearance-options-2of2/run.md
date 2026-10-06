# 실행 기록 — 패널·탭 모양 옵션 (활성 패널 테두리 강조 끄기 · 탭 모양)

## 슬라이스 결과
- S1 실패하는 테스트 먼저 — ✅ red 확인: `td-config`는 필드가 없어 컴파일 오류, vitest는 5건 실패(테두리 끄기 1, 칸형 탭 3, 설정 화면 1). 켜진 상태·`data-active`·기본값 회귀 테스트는 구현 전에도 통과했다(회귀 방지라 정상).
- S2 `td-config` 2필드(`pane_highlight`, `tab_style`) + `default.toml` + `ENUMS` 5번째 항목 + `task gen-types` — ✅ 계획대로
- S3 `Pane.tsx` 테두리, `TabBar.tsx` 칸형 — ✅ 계획대로. 기본값(`underline`)의 클래스 문자열은 한 글자도 바뀌지 않았다(테스트로 고정).
- S4 설정 화면 2항목, 설정 테스트, `docs/06-config-plugins.md` — ✅ 계획대로

## DoD baseline → after
1. `cargo test -p td-config` — 25건 → 26건(새 테스트 1건: 기본값·라운드트립·`tab_style` 허용값 밖 경고). red → green.
2. `up_to_date` 통과. bindings의 2개 키: 0 → 2.
3. `pane-tab-appearance.test.tsx` — 파일 없음 → 8건 통과. (a)(c)와 설정 화면 단언은 구현 전에 실패했다.
4. `settings.test.tsx` — 항목 존재·저장 단언 추가, 통과.
5. `tsc` 0, vitest(pdf-preview 제외) 85파일 749건 → 86파일 760건 통과.
6. `docs/06-config-plugins.md`의 `pane_highlight|tab_style` — 0 → 2.

## 판단·발견
- 문서에 `[behavior.layout]` 표가 이미 있어서 새 표를 만들면 TOML 예시가 중복된다. 처음에 따로 만들었다가 기존 표에 합쳤다(문서만의 문제).
- 칸형 탭: 탭마다 `border-r`로 칸 구분선을 넣고 마지막 탭만 뺀다(`last:border-r-0`). 계획에는 구분선이 없었다 — 칸이 붙어 보이면 경계가 모호해서 넣은 작은 보탬이다. 색은 기존 `border-app-line`이다.
- 칸형 활성 탭의 배경은 `bg-app-selected`(커서 행 배경과 같은 변수)다. 이 배경이 비활성 탭과 라이트·다크 테마에서 충분히 구분되는지는 **눈으로 확인하지 못했다.**
- 패널 테두리를 끄면 활성 패널은 커서 행의 왼쪽 막대(`border-accent`)로만 구분된다. 커서 행 꽉 채움을 함께 켜면 더 눈에 띈다(1/2).
- 탭이 아주 많을 때 칸형이 어떻게 보이는지(글자가 모두 말줄임이 되는 한계)는 테스트하지 않았다.
