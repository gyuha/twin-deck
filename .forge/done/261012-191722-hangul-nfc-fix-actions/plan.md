<!-- forge-slug: hangul-nfc-fix-actions -->
<!-- task: 140 -->
<!-- tdd: off -->
# 한글 자소 분리(NFD) 파일 이름을 조합형(NFC)으로 고치는 명령 (이슈 #50)

## Goal / Non-goals
- Goal: macOS가 만든 자소 분리(NFD) 한글 파일 이름을 조합형(NFC)으로 바꾸는 액션 둘을 Actions Panel(`Mod+Shift+P`)에서 실행할 수 있다. (1) "선택한 파일 한글 자소 문제 수정": 선택한 항목(선택이 없으면 커서 항목)의 이름만 고친다. (2) "현재 폴더 한글 자소 문제 수정": 현재 폴더 바로 아래 항목의 이름을 고친다(하위 폴더 안은 건드리지 않는다). 끝나면 몇 개를 고쳤는지 알려 준다. 참고: https://github.com/elgar328/nfd2nfc
- Non-goals: 하위 폴더 재귀, 기본 단축키 지정, 폴더 감시로 자동 변환(nfd2nfc의 상주 기능), 파일 내용 변경, 아카이브 안의 이름, 이름이 겹치는 항목을 덮어쓰기.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈: https://github.com/gyuha/twin-deck/issues/50
- Definition of Done:
  1. `cargo test -p td-ops normalize`가 4개 이상 실행되어 통과한다. 테스트는 실제 파일 시스템에서 NFD로 만든 파일을 고친 뒤 `read_dir`이 돌려주는 이름의 바이트가 NFC인지로 단언한다(함수 존재가 아니라 결과). 이미 NFC인 이름은 그대로, 같은 NFC 이름의 다른 파일이 있으면 덮어쓰지 않고 건너뛰며 원본이 남는다.
  2. 현재 폴더 명령은 바로 아래만 고친다: NFD 이름의 하위 폴더 "안"의 NFD 파일은 그대로 남는다는 단언이 테스트에 있다.
  3. `cargo test -p twin-deck-desktop`이 통과한다(`up_to_date`, `capabilities_cover_plugins` 포함).
  4. vitest에 두 액션 테스트가 있고 통과한다: (a) 선택 명령은 선택한 항목만 NFC로 바꾼다, (b) 현재 폴더 명령은 바로 아래만 바꾸고 하위 폴더 안은 두며, 결과 개수를 알린다, (c) 두 액션이 Actions Panel에 위 이름으로 보인다. 전체 `bunx vitest run`이 통과한다.
  5. `cargo fmt --check`, `cargo clippy -p td-ops -- -D warnings`, `cargo clippy -p twin-deck-desktop -- -D warnings`, `cd apps/desktop && bunx tsc --noEmit` 통과.
  6. `grep -c "자소"`가 `docs/05-actions-keybindings.md`, `README.md`에서 각각 ≥1이고 `grep -ci "jamo\|NFD"`가 `README.en.md`에서 ≥1이다(세 파일 모두 사전 상태 0 확인함. README.md와 README.en.md는 한 쌍).
  7. 실제 앱에서 명령을 실행해 보는 것은 눈으로 확인하지 못한다. run.md에 "확인 못함"으로 적는다.

## Work slices
- [ ] S1. `td-ops`에 이름을 NFC로 고치는 연산을 더한다. 대상이 이미 NFC면 건너뛰고, 아니면 임시 이름으로 옮긴 뒤 NFC 이름으로 옮기며(APFS는 NFC·NFD를 같은 이름으로 보므로 "이미 있음" 검사를 믿을 수 없다), 같은 NFC 이름의 다른 항목이 있으면 원래 이름으로 되돌리고 건너뛴 목록에 담는다. 결과로 고친 개수·건너뜀·실패를 돌려준다 — completion criterion: DoD 1, 2.
- [ ] S2. 서비스·Tauri 명령·`Backend`(`backend.ts`, `tauri.ts`, `fake.ts`)에 이어 붙이고 `task gen-types`로 bindings를 다시 만든다. 현재 폴더용은 폴더를 읽어 직접 자식만 대상으로 한다 — completion criterion: DoD 3. (depends: S1)
- [ ] S3. 액션 `core.file.fix_hangul_selected`("선택한 파일 한글 자소 문제 수정")와 `core.file.fix_hangul_dir`("현재 폴더 한글 자소 문제 수정")를 `defaults.ts`·`actions.ts`·스토어·ko/en 문구에 더하고, 끝나면 개수를 알린다. 기본 단축키는 없다. vitest를 쓴다 — completion criterion: DoD 4, 5. (depends: S2)
- [ ] S4. `docs/05-actions-keybindings.md`, `README.md`, `README.en.md`(한 쌍, 같은 커밋)에 두 명령을 적는다 — completion criterion: DoD 6.
