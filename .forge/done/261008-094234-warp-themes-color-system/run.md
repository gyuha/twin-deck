# RUN — 앱 색을 Warp 테마(apps/desktop/themes)로 바꾸고 기본을 Catppuccin으로 한다 (#107)

## 슬라이스 결과
- S1 `scripts/gen-themes.mjs`(YAML → `themes.generated.ts`·`themes.rs`), `task gen-types`·`justfile` 연결, `gen-themes.test.mjs` — ✅ as planned (파서가 `normal`/`bright` 중첩을 잘못 읽는 버그를 한 번 고침, 정렬 기준을 파일 이름이 아니라 id로 바꿈)
- S2 `lib/themeColors.ts`(`themeVars`·`resolveTheme`·`mix`·`contrast`·`inkOn`)와 `theme-colors.test.ts` — ⚠ 계획의 "50% 혼합" 대신 흐린 글자를 대비 기준(≥3.0, 일반 보조 글자 ≥4.5)을 넘는 가장 큰 혼합 비율로 정하는 `dim()`을 넣음(고정 비율로는 16개 테마가 대비 3 미만)
- S3 `useTheme` 교체(인라인 `--color-*`, `data-theme`·`data-color-theme`·클래스), `index.css`에서 옛 테마 5종 제거, `theme.test.tsx` 갱신 — ⚠ 강조색 위 글자색을 위해 새 토큰 `--color-accent-ink`(theme.css `@theme`)를 만들고 `text-white`를 쓰던 7곳(Combobox·ContextMenu·Queue·FileTable·DragLayer·FindDialog·Dialog)을 `text-accent-ink`로 바꿈(treemap 타일 글자는 고정 색 위라 `text-white` 유지)
- S4 Rust `behavior.theme` 검증(`system`·`light`·`dark` + `THEME_IDS`)과 `td-config` 테스트 — ✅ as planned (옛 이름은 경고 후 `system`)
- S5 설정 화면 선택 목록 115개와 `settings.test.tsx`, `docs/06-config-plugins.md`, `apps/desktop/themes/README.md` 새로 작성 — ✅ as planned

## DoD 기준선 → 이후
1. 생성: 없음(forward) → `bun test scripts/gen-themes.test.mjs` 5 통과(최신 일치·112개·Mocha/Latte 값·normal≠bright·잘못된 색 오류)
2. 색 계산: 없음(forward) → `theme-colors.test.ts` 9 통과(spaceui `theme.css`의 `--color-*` 이름 전부 포함, Mocha 값, 112개 모두 ink≥4.0·faint≥3.0·강조색 위 글자≥4.5)
3. 적용: 옛 spaceui 7종 케이스 → `theme.test.tsx` 22 통과(light=Latte·dark=Mocha·system=OS 따라감·테마 이름·옛 이름 폴백·이전 값 안 남음)
4. Rust: `cargo test -p td-config` 29 → 30 통과(모든 이름 경고 없음, 옛 이름 경고+system), `cargo clippy -p td-config -- -D warnings` 통과(기준선과 같음)
5. 설정·CSS: 8개 선택 → 115개(`settings.test.tsx` 18 통과), `index.css`는 dark·light만 불러옴, 토큰 가드(Tailwind 기본 팔레트 금지 등) 의미 변경 없이 통과
6. 회귀: vitest 927 통과 → **941 통과**(+14), 로드 실패는 기준선 잡음 `model-formats.test.ts` 1개뿐(기준선과 같음), `tsc` 0 → 0, `cargo test -p twin-deck-desktop up_to_date` 통과(`src-tauri` 변경 0), `vite build` 성공(`text-accent-ink` 유틸리티가 생성되고 `themes/`는 번들에 안 들어감)

## 기존 테스트를 바꾼 곳 (의도된 변경)
- `theme.test.tsx`: 옛 spaceui 7종 케이스를 새 규칙으로 교체, index.css 가드를 "dark·light만"으로.
- `settings.test.tsx`: 테마 고르기를 `dracula-default`로, 목록 115개 케이스 추가.
- `list-appearance.test.tsx`: "`text-accent`가 없어야 한다"가 부분 문자열 검사라 `text-accent-ink`에 걸렸다. 의도(글자색이 배경색과 같은 클래스가 아님)는 그대로 두고 클래스 단위 비교로 고쳤다.
- `crates/td-config/tests/config.rs`: `theme_accepts_spaceui_themes` → 새 허용 목록 테스트, 옛 이름 폴백 테스트 추가.

## 학습
- 고정 혼합 비율은 대비가 낮은 테마(밝은 테마 16개)에서 흐린 글자를 읽을 수 없게 만든다. 대비 하한을 먼저 정하고 비율을 거기에 맞추는 편이 안전했다.
- `text-white`는 강조색 배경 위 글자와 treemap 타일 글자(고정 어두운 색)에 섞여 쓰였다. 둘을 같은 토큰으로 묶지 않은 것이 맞았다.
- 부분 문자열 클래스 검사(`not.toContain("text-accent")`)는 새 클래스 이름이 접두사를 공유하면 깨진다.
- **실제 앱에서 색을 눈으로 확인하지 못했다**: 대비 수치·토큰 완전성·적용 로직만 기계로 검사했다. 표면 단계가 보기 좋은지, 어두운 쪽 테마의 구분이 충분한지, 설정을 읽기 전 첫 그림의 깜빡임은 직접 봐야 한다.
- 라이선스(테마 색은 `themes.generated.ts`로 앱에 들어간다)는 확인하지 않았다. README에 경고를 남겼다.
