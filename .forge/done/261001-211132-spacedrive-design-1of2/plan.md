<!-- forge-slug: spacedrive-design-1of2 -->
<!-- task: 3 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# Spacedrive 디자인 토큰 적용과 테마 8종

## 목표 / 비목표
- 목표: `@spacedrive/tokens`(spaceui, MIT)로 앱 전체 색을 Spacedrive 의미 기반 토큰으로 바꾸고, 테마를 dark/light/midnight/noir/slate/nord/mocha + system 중에서 고를 수 있게 한다. 기본 테마는 system.
- 비목표:
  - `@spacedrive/primitives` 도입과 설정 화면 (2/2 작업).
  - 기존 다이얼로그·팝업 메뉴·Actions Panel·파일 목록을 radix 컴포넌트로 바꾸는 것 (키보드 라우터와 포커스/Esc 충돌 위험, 사용자 결정).
  - 사용자 정의 테마 파일(`themes/*.toml`, docs/06 §7).
  - Inter 글꼴 번들. `--font-sans`는 spaceui 값 그대로 두어 system-ui로 대체된다.
  - Spacedrive 본 저장소(`spacedriveapp/spacedrive`, 라이선스 NOASSERTION)의 코드 복사. spaceui의 npm 패키지만 쓴다.

## 합의한 동작
- 색: Tailwind 기본 팔레트 클래스(`neutral-500`, `blue-600`, `text-white`, `bg-black/20` 등)를 spaceui 의미 기반 클래스(`ink`, `ink-dull`, `ink-faint`, `app`, `app-box`, `app-line`, `app-selected`, `accent`, `menu`, `status-error` 등)로 모두 바꾼다. `@spacedrive/tokens/theme`이 기본 팔레트를 지우므로(`--color-*: initial`) 하나도 남기지 않는다.
- 글자 크기 체계는 spaceui 값(`text-sm` 0.8rem 등)을 따른다.
- 파일 목록 커서·선택(시각 확인에서 B안 확정): 커서 행은 은은한 배경(`app-selected`) + accent 왼쪽 막대, 선택 항목은 accent 굵은 글자, 비활성 패널의 커서 막대는 `ink-faint`. 활성 패널은 accent로 구분한다.
- 테마 전환: `behavior.theme` 값을 8종으로 넓히고 `<html>`에 spaceui 테마 클래스(`.dark`, `.light`, `.midnight-theme` …)를 건다. system은 OS 다크 모드에 따라 dark/light. 잘못된 값은 지금처럼 경고 후 기본값.
- 기존 다크 덮어쓰기 파일(`theme.css`의 `--color-neutral-*` 등)과 `--td-surface`/`--td-fg`는 토큰으로 대체하고 지운다. "컴포넌트가 쓰는 색이 다크에서 덮어써졌는지" 보던 테마 가드 테스트는 "기본 팔레트 클래스가 남지 않았는지" 보는 가드로 바꾼다.
- `THIRD_PARTY_NOTICES.md`에 `@spacedrive/tokens`(MIT)를 추가하고, `docs/03`/`docs/04`의 "npm 게시 여부 [알 수 없음]"을 확인된 사실(0.2.3, MIT)로 고친다.

## 기준 문서
- 용어집: `.forge/CONTEXT.md`의 테마, 내장 기본값, 사용자 설정
- 관련 ADR: 없음 (프로젝트 문서 `docs/04-spacedrive-reuse.md:61`, `docs/03-tech-stack.md:24`, `docs/06-config-plugins.md` §7이 이미 "tokens를 기반으로 한다"고 정해 두었다)
- 완료 정의(DoD):
  1. `grep -rEn '(bg|text|border|ring|outline|divide|fill|stroke)-(neutral|blue|red|green|yellow|amber|gray|zinc)-[0-9]{2,3}|text-white|bg-white|bg-black|text-black' apps/desktop/src --include='*.tsx' | grep -v __tests__ | wc -l` → 0 (사전 64, 전진 확인)
  2. `grep -c '@spacedrive/tokens' apps/desktop/package.json` → 1 이상 (사전 0, 전진 확인)
  3. `grep -c '^theme = "system"' crates/td-config/src/default.toml` → 1 (사전 0, 전진 확인)
  4. `cargo test -p td-config theme_accepts_spaceui_themes` → `1 passed` (사전: 그런 테스트가 없어 0개 실행, 전진 확인. 8개 값을 받아들이고 그 밖의 값은 경고하는지 본다)
  5. `bun run --cwd apps/desktop test -- theme -t "spaceui"` → 1개 이상 통과, 실패 0 (사전: 해당 이름의 테스트가 없어 모두 건너뜀, 전진 확인. 테마 클래스 전환과 기본 팔레트 가드를 본다)
  6. `cargo test --workspace` → 실패 0 (회귀 방지: 착수 전 통과)
  7. `bun run test` → 실패 0 (회귀 방지: 착수 전 desktop 271개 통과)
  8. `bun run typecheck`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings` → 종료 코드 0 (회귀 방지: 착수 전 통과)
  9. `cargo test -p twin-deck-desktop up_to_date` → 통과 (회귀 방지: 기본 테마가 바뀌므로 `default-config.json`을 재생성한 뒤에도 통과해야 한다)
  10. 실제 앱(UAT): `config.toml`의 `behavior.theme`를 dark/light/midnight로 바꿔 가며 파일 목록·탭·다이얼로그·Action Bar·작업 큐·진행 창이 읽기 좋은지, 커서가 B안 모양인지 사용자가 눈으로 확인한다. 시각 판단이라 명령으로 남길 수 없다.

## 작업 조각
- [ ] S1. `@spacedrive/tokens` 설치, `index.css`에 theme/base import, 테마 7종 CSS import, `theme.css`의 다크 덮어쓰기 제거 — 완료 기준: DoD 2가 충족되고 앱이 빌드된다(`bun run --cwd apps/desktop build`).
- [ ] S2. 테마 값 확장: td-config 검증을 8종으로, 기본값 system, `default-config.json` 재생성, `App.tsx`의 `useTheme`이 `<html>`에 spaceui 테마 클래스를 건다 — 완료 기준: DoD 3·4·9 충족, 테마 전환 vitest 통과. (depends: S1)
- [ ] S3. 컴포넌트 11개 파일의 기본 팔레트 클래스를 의미 기반 토큰으로 교체, 커서·선택 B안 적용, 테마 가드 테스트를 기본 팔레트 가드로 교체 — 완료 기준: DoD 1·5 충족. (depends: S1)
- [ ] S4. `THIRD_PARTY_NOTICES.md`, `docs/03`, `docs/04`, `docs/06` §7 갱신 — 완료 기준: `grep -c '@spacedrive/tokens' THIRD_PARTY_NOTICES.md` → 1 이상, `docs/03-tech-stack.md`에서 tokens 행의 `[알 수 없음]`이 사라진다. (depends: S1)
