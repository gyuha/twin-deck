<!-- forge-slug: list-appearance-options-1of2 -->
<!-- task: 78 -->
<!-- part: 1/2 -->
<!-- tdd: on -->
# 파일 목록 모양 옵션: 줄무늬 행 · 표시 칸 숨기기 · 폴더 모양 · 커서 행 꽉 채움

## Goal / Non-goals
- Goal: 파일 목록의 모양을 바꾸는 설정 4개를 추가한다. 모두 설정 화면의 "모양" 탭에 넣고, **기본값은 지금 모양과 같아서** 기존 사용자의 화면은 바뀌지 않는다.
  - `behavior.table.zebra_rows` (스위치, 기본 꺼짐): 행 배경을 번갈아 옅게 칠한다. 새 색은 만들지 않고 기존 테마 변수의 옅은 농도를 쓴다.
  - `behavior.table.show_marks` (스위치, 기본 켜짐): 행 맨 앞 **표시 칸**(`●` 선택, `▸` 폴더)을 보일지. 끄면 칸 자체가 열 정의에서 빠진다. 선택은 지금처럼 굵은 강조색 글씨로만 구분한다.
  - `behavior.table.folder_style` (선택, 기본 `none`): `none` / `brackets`(`[이름]`) / `parens`(`(이름)`) / `slash`(`이름/`). **폴더 모양**은 이름 열의 화면 표시만 바꾸고 실제 이름·경로·이름 바꾸기 입력창·복사되는 경로는 그대로다. 폴더(폴더 심볼릭 링크 포함)에만 붙는다. 빠른 선택(타이핑으로 이름 찾기)의 일치 글자 강조는 이름 부분에만 걸린다. 다중 열 보기에서도 같은 규칙이다. 허용값 밖이면 경고하고 기본값으로 되돌린다(`validate_enums`).
  - `behavior.table.cursor_fill` (스위치, 기본 꺼짐): 활성 패널의 **커서 행**을 테마의 accent 색으로 꽉 채운다. 비활성 패널은 지금처럼 은은한 배경이다. 꽉 채운 행 위에서 글자가 배경과 같은 색이 되지 않게 글자색을 따로 정한다.
- 출처: 이슈 #12의 스크린샷(Marta)과 요청 5개 중 "줄무늬 행", "선택·folding icon 영역 숨기기", "folder prefix/postfix", "Active panel의 현재 파일 highlight 추가".
- Non-goals: 패널 테두리 강조 끄기와 탭 모양(2of2), 새 색·새 테마 추가, 앞뒤 글자를 직접 입력하는 방식, 비활성 패널의 커서 숨기기, 파일(폴더 아닌 항목)에 장식 붙이기, 이슈 #12를 닫는 일(2of2까지 끝난 뒤 사용자가 판단).

## Source of truth
- Glossary terms: **커서 행**, **표시 칸**, **폴더 모양** (`.forge/CONTEXT.md` 에 이번에 추가)
- Related ADRs: none (어느 ADR도 이 설정들과 충돌하지 않는다고 판단. `docs/adr/`의 `0006-toml-config.md`는 설정 키 규칙 참고)
- 이슈 추적: GitHub 이슈 #12
- 설정 키 추가 절차(AGENTS.md): `td-config` 구조체 + `default.toml` → `task gen-types` → `ui/Settings.tsx` `SECTIONS`(점 표기 키) → 설정 탭 목록 테스트. `folder_style`은 `crates/td-config/src/load.rs`의 `ENUMS`에 허용값을 등록한다.
- Definition of Done (착수 전 기준선: `cargo test -p td-config` 24건, `up_to_date` 2건 통과, `tsc` 0, vitest 84파일 732건 통과. vitest는 한 번 실행에서 일시적으로 1건 실패했다가 재실행에서 사라진 적이 있다):
  1. `cargo test -p td-config` 통과. 새 테스트: 4개 키의 기본값(`false`/`true`/`none`/`false`), 사용자 설정 라운드트립, `folder_style`에 허용값 밖(`x`)이면 경고하고 `none`으로 되돌림. **새 테스트는 구현 전에 실패(red)해야 한다.**
  2. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과. `grep -c "zebra_rows\|show_marks\|folder_style\|cursor_fill" packages/ts-client/src/generated/bindings.ts` ≥ 4 (착수 전 0).
  3. `cd apps/desktop && bunx vitest run src/__tests__/list-appearance.test.tsx` 통과, `it(` 8개 이상(착수 전 파일 없음). 값으로 단언한다: (a) 줄무늬 on이면 홀수·짝수 행의 표시 속성이 서로 다르고 off이면 같다, (b) `show_marks` off이면 행의 첫 칸이 없고 `●`/`▸`가 DOM에 없으며 on이면 있다, (c) 폴더 모양 3종이 폴더 행의 이름 칸 글자를 `[docs]`/`(docs)`/`docs/`로 바꾸고 파일 행은 그대로다, (d) 폴더 모양이 적용돼도 이름 바꾸기 입력창의 초기값은 `docs`(장식 없음), (e) `cursor_fill` on이면 활성 패널의 커서 행에 꽉 채움 표시가 붙고 비활성 패널의 커서 행에는 붙지 않는다, (f) 선택한 행이 커서 행일 때 꽉 채움 + 선택 글자색이 같은 색 클래스가 되지 않는다, (g) 기본값에서는 행의 클래스와 구조가 지금과 같다(회귀 방지). 이 테스트들은 구현 전에 (a)~(f)가 실패(red)해야 한다.
  4. `settings.test.tsx` 통과(탭 목록 테스트 포함)와 설정 화면에 4개 항목이 있다는 단언 추가(착수 전 항목 없음).
  5. `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run --exclude '**/pdf-preview*'` 통과(회귀 방지: 사전 통과가 정상. 기존 `file-ops`, `file-icons` 포함).
  6. `docs/`에 4개 키가 적혔다: `grep -c "zebra_rows\|show_marks\|folder_style\|cursor_fill" docs/06-config-plugins.md` ≥ 4 (착수 전 0).

## Work slices
- [ ] S1. 실패하는 테스트 먼저: `td-config` 설정 테스트와 `list-appearance.test.tsx`(a)~(g)를 쓰고 red를 기록한다 — completion criterion: DoD 1·3의 red 상태
- [ ] S2. `td-config`: 구조체 4필드 + `default.toml` + `ENUMS` 등록, `task gen-types` — completion criterion: DoD 1, 2 (depends: S1)
- [ ] S3. `FileTable.tsx`: 줄무늬, 표시 칸 열 제거, 폴더 모양 표시, 커서 행 꽉 채움을 설정값으로 분기한다. 기본값의 클래스·구조는 변하지 않는다 — completion criterion: DoD 3 green (depends: S2)
- [ ] S4. `Settings.tsx` "모양" 탭에 4개 항목, 설정 테스트, `docs/06-config-plugins.md` 갱신 — completion criterion: DoD 4, 6 (depends: S2)
