# run — 한글 자소 분리(NFD) 이름을 NFC로 고치는 명령 (이슈 #50)

워크플로우 없이 이 세션에서 직접 실행했다(범위가 작고 경로가 정해져 있음).

## 슬라이스 결과
- S1 td-ops `normalize_names`/`normalize_dir` + 실제 파일 시스템 테스트 4개 — ✅ as planned (APFS에서 NFD로 만든 파일이 고친 뒤 NFC 바이트로 읽힘을 단언)
- S2 서비스·Tauri 명령 2개·Backend(`backend.ts`/`tauri.ts`/`fake.ts`)·bindings 재생성 — ✅ as planned
- S3 액션 2개(`core.file.fix_hangul_selected`/`core.file.fix_hangul_dir`)·스토어·ko/en 문구·vitest 5개 — ⚠ `i18n-rust-messages`가 td-ops의 한국어 오류 문구 2개를 대응표에 넣으라고 요구해 `i18n/rust.ts`에 더함(계획에 없던 파일)
- S4 docs/05, README.md, README.en.md — ✅ as planned

## DoD baseline → after
- 1 `cargo test -p td-ops normalize`: 0개 → 4 passed
- 2 현재 폴더 바로 아래만 고침(하위 폴더 안은 그대로): td-ops 테스트와 vitest 모두 → passed
- 3 `cargo test -p twin-deck-desktop`: 115 passed (`coalesce`는 병렬에서 한 번 실패, 단독 재실행 통과)
- 4 vitest 5개(선택/현재 폴더/없음/충돌 건너뜀/Actions Panel 노출) 통과, 전체 1222 passed
- 5 fmt·clippy(td-ops, twin-deck-desktop)·tsc 통과
- 6 `grep -c 자소` docs/05 0→2, README.md 0→1, `grep -ci "jamo|NFD"` README.en.md 0→1
- 7 실제 앱에서 명령 실행: **눈으로 확인하지 못함**

## 알아 둘 점
- 같은 NFC 이름의 다른 파일이 있을 때 덮어쓰지 않는 동작은 NFD를 그대로 저장하는 파일 시스템(SMB 등)에서만 생긴다. APFS에서는 두 이름이 한 파일이라 td-ops의 해당 테스트가 조기 반환한다(그 경우를 vitest 가짜 백엔드가 대신 검증한다).
- 이름 바꾸기는 임시 이름(`.td-nfc-<pid>-<n>`)을 거친다. 중간에 앱이 죽으면 그 임시 이름이 남을 수 있다.
- 아카이브 안·검색 결과(virtual)에서는 막는다.
