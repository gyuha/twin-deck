# LOOP — 설정 저장 경로 지정 + 설정 내보내기·가져오기 (이슈 #71)
started: 2026-10-15
replan-round: 0
replan-cap: 3
budget-tokens: none
budget-spent: 0 · since: 2026-10-15T03:51:54Z
wall: none

## Stop-condition checks (ALL must pass)
- [ ] C1. `cargo test -p td-config` 종료 코드 0 **그리고** `cargo test -p td-config -- --list 2>/dev/null | grep -cE 'location|export|import'` ≥ 3 (경로 해석·내보내기·가져오기 테스트가 실제 값을 단언)
- [ ] C2. `cargo test -p twin-deck-desktop` 종료 코드 0 (바인딩 최신 여부 `up_to_date` 포함) **그리고** `cargo test -p twin-deck-desktop -- --list 2>/dev/null | grep -cE 'config_location|export|import'` ≥ 2
- [ ] C3. `cd apps/desktop && bunx vitest run` 종료 코드 0 **그리고** `grep -rlE "내보내기|가져오기|저장 경로" apps/desktop/src/__tests__ | wc -l` ≥ 1
- [ ] C4. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0
- [ ] C5. `cargo clippy -p td-config -p twin-deck-desktop -- -D warnings` 종료 코드 0 **그리고** `cargo fmt --all --check` 종료 코드 0
- [ ] C6. `grep -cE '^#+ .*(저장 경로|내보내기)' docs/06-config-plugins.md` ≥ 2

## Check progress (updated after EVERY stop-condition run — drives the no-progress & tension walls & fg-status)
- C1: pass · regressed: ×0 · last-evidence: "cargo test -p td-config → 9+47 통과, --list location|export|import → 9" (task 165 봉인 후)
- C2: pass · regressed: ×0 · last-evidence: "cargo test -p twin-deck-desktop → 128 통과(up_to_date 포함), --list config_location|export|import → 6"
- C3: pass · regressed: ×0 · last-evidence: "vitest → 164파일 1363 통과, 해당 테스트 파일 1"
- C4: pass · regressed: ×0 · last-evidence: "tsc --noEmit → 오류 없음"
- C5: pass · regressed: ×0 · last-evidence: "clippy -p td-config -p twin-deck-desktop -D warnings 통과, fmt --check 통과"
- C6: fail ×1 · regressed: ×0 · last-evidence: "제목 개수 → 1 (저장 경로 절만 있음, 내보내기 절은 task 166 몫)"

## Authorized replan scope
- 위 검사 중 실패한 것과 직접 이어지는 수정 작업만 자동으로 만든다. 그 밖의 일은 하지 않는다.
- always-halt action classes (safety wall): prod data mutation/deletion · deploy/release/publish · outbound external comms (email · messaging · third-party write APIs) · irreversible VCS/file destruction (force-push · history rewrite · mass deletion) · financial/payment · secret/permission change · privacy-data exposure
- 추가 제외: push·`task deploy`·`task release`·버전 올리기 금지. 기존 테스트의 기대값을 단지 통과시키려고 약하게 고치는 것 금지.

## 확정된 설계 결정 (초기 문답, 2026-10-15)
- 저장 경로를 바꾸면 `config.toml`·`keybindings.toml`만 그 경로에 둔다. `state.json`(탭·커서·창)은 늘 로컬 앱 설정 폴더에 남는다.
- 지정 경로는 로컬 앱 설정 폴더의 작은 포인터 파일에 적는다(그 경로 안의 config.toml에 적으면 닭과 달걀 문제).
- 새 경로에 이미 `config.toml`이 있으면 매번 묻는다: "그 경로 설정 사용" / "지금 설정으로 덮어쓰기(기존은 .bak)". 비어 있으면 묻지 않고 지금 설정을 복사한다.
- 내보내기는 `config.toml`+`keybindings.toml`을 담은 zip 하나. 가져오기는 그 zip을 골라 지금 파일을 .bak으로 백업하고 바꾼다.

## Tasks
- config-location-setting
- config-export-import
