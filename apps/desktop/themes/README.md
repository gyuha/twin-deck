# Warp 색상 테마 (원본 데이터)

[TerminalColors](https://terminalcolors.com/)에서 제공하는 Warp용 YAML 테마 112개(2026-10-08 내려받음)다. 앱에 번들되지 않는 **원본 데이터**이고, 앱은 실행 중에 이 파일을 읽지 않는다.

빌드 때 `scripts/gen-themes.mjs`(`task gen-types`)가 이 YAML을 읽어 두 파일을 만든다.

- `apps/desktop/src/lib/themes.generated.ts` — 테마마다 `background`·`foreground`·`accent`와 터미널 normal의 `red`·`green`·`yellow`·`blue`. 앱의 색 계산(`lib/themeColors.ts`)이 읽는다.
- `crates/td-config/src/themes.rs` — 설정 `behavior.theme`에 쓸 수 있는 테마 이름(파일 이름) 목록.

테마를 추가·수정하면 `task gen-types`를 다시 실행한다. 생성 파일이 최신이 아니면 `bun test scripts/gen-themes.test.mjs`가 실패한다. 기본 테마는 `catppuccin-latte`(light)·`catppuccin-mocha`(dark)다.

**라이선스**: 각 테마의 원저작자와 라이선스는 서로 다를 수 있다. Dracula 공식 팔레트는 MIT이나, 이것이 이 디렉터리의 모든 파일 또는 TerminalColors의 변환 파일에 동일하게 적용된다는 뜻은 아니다. 이 YAML 파일 자체는 앱에 들어가지 않지만 테마의 색 값은 생성된 `themes.generated.ts`로 앱에 들어가므로, 앱을 배포하기 전에 테마별 출처와 재배포 조건을 확인하고 필요한 고지문을 추가해야 한다.
