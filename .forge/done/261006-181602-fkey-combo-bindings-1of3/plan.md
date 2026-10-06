<!-- forge-slug: fkey-combo-bindings-1of3 -->
<!-- task: 70 -->
<!-- part: 1/3 -->
<!-- tdd: off -->
# F키 설정이 조합키(Ctrl/Alt/Shift/Mod + F키)를 받아들이게 한다 (설정·바인딩 계층)

## Goal / Non-goals
- Goal: `fkeys`/`fkey_apps`의 키로 `F5` 외에 `Ctrl+F5`, `Mod+Shift+F2` 같은 조합키(수식키 Ctrl·Alt·Shift·Mod + F1~F12)를 쓸 수 있게 한다. td-config 검증과 `fkeyBindings()`가 이를 처리하고, 같은 F키에 서로 다른 조합을 여러 개 걸 수 있다.
- Non-goals: 설정 화면 UI(2of3), Action Bar 노출(3of3), 기본값 `[fkeys]` F1~F12 줄 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: `docs/adr/0007-action-registry.md`, `0010-cross-platform-keymap.md` (Mod 의미), `0006-toml-config.md`
- 이슈 추적: GitHub 이슈 #16
- Definition of Done:
  1. `cargo test -p td-config fkey_combo` 통과 — 유효한 조합키 키(`Ctrl+F5`, `Mod+Shift+F2`)는 유지되고, 잘못된 키(`Ctrl+A`, `F13`, `Foo+F1`)는 경고와 함께 빠진다. 새 테스트는 구현 전 상태에서 실패(red)해야 한다.
  2. 수식키 표기는 `@twin-deck/keybinds`가 이해하는 정식 표기와 같다(`cd apps/desktop && bunx vitest run src/__tests__/fkey-bindings.test.tsx` 통과, 조합키 케이스 포함).
  3. `fkeyBindings({ fkeys: { "Ctrl+F5": "core.copy", F5: "core.move" }, fkey_apps: {} })`가 두 바인딩을 모두 만든다 — 단위 테스트로 증명.
  4. 앱 실행 액션이 조합키에서도 `fkey_apps["Ctrl+F5"]` 경로를 인수로 싣는다 — 테스트로 증명.
  5. `task gen-types` 후 `cargo test -p twin-deck-desktop up_to_date` 통과, `cd apps/desktop && bunx tsc --noEmit` 통과.
  6. 기준선 이미 통과: 기존 F1~F12 설정 테스트(`fkey-bindings.test.tsx` 기존 케이스) 회귀 방지용이라 사전 통과가 정상이다.

## Work slices
- [ ] S1. td-config가 `fkeys`/`fkey_apps`의 키를 `[수식키+]F1~F12`로 검증한다 — completion criterion: DoD 1
- [ ] S2. `lib/fkeys.ts`의 `fkeyBindings`가 설정에 있는 모든 유효한 키를 순회해 바인딩을 만든다(1~12 고정 루프 제거) — completion criterion: DoD 2~4 (depends: S1)
- [ ] S3. `docs/05-actions-keybindings.md`의 F키 설정 설명에 조합키를 적는다 — completion criterion: `grep -c "Ctrl+F" docs/05-actions-keybindings.md` ≥ 1
