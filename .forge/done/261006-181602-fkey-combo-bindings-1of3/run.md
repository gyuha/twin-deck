# 실행 기록 — F키 조합키 설정·바인딩 계층

## 슬라이스 결과
- S1 td-config가 `fkeys`/`fkey_apps`의 조합키 키(`Mod+Ctrl+Alt+Shift+` 순서 + F1~F12)를 검증 — ✅ 계획대로 (`merge.rs`의 `is_fkey_combo`)
- S2 `fkeyBindings`가 설정의 모든 키를 순회 — ✅ 계획대로 (1~12 고정 루프 제거)
- S3 문서 — ✅ 계획보다 조금 더: `docs/05-actions-keybindings.md`에 5.7절 신설

## DoD baseline → after
1. `cargo test -p td-config fkey_combo` — 테스트 없음 → 통과. 구현 전 상태에서의 red 실행은 따로 하지 않았다(⚠). 잘못된 키는 구현 전에도 "알 수 없는 키" 경고로 빠지지만, 유효한 조합키가 유지되는 단언은 구현 전에 실패했을 것이다.
2. `fkey-bindings.test.tsx` — 12 → 15개 통과 (기존 케이스 유지)
3~4. 단위 테스트 2건 추가, 통과
5. `up_to_date` 통과(gen-types 결과 변경 없음), `tsc --noEmit` 종료 0
6. 기존 F1~F12 케이스 — 사전 통과(회귀 방지)

## 판단·발견
- 수식키 표기 순서는 `Mod, Ctrl, Alt, Shift`로 고정했다(중복 표기 방지). 계획의 예시 `Mod+Shift+F2`는 이 순서에 맞는다.
- `Ctrl+F2`가 Linux에서 `Mod+F2`와 같은 chord가 되어 충돌할 수 있다. 충돌 처리는 이 계획 범위 밖(Non-goals)이라 두었다.
- 전체 vitest(pdf-preview 제외) 78파일 689건 통과.
