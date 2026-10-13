# 2026-10-13 — 덮어쓰기·이동에서 원본·대상이 사라지는 문제를 막는다 (td-ops, 적대적 리뷰 수정)

## Plan vs actual
- What went as planned: 회귀 테스트를 먼저 써서 수정 전 12개가 빨강임을 확인(S1), 같은 파일·조상·하위 판정을 실제 위치 비교로 교체(S2), Overwrite를 "옆으로 치워 두고 → 성공하면 삭제 / 실패·중단하면 복원"으로 바꿈(S3), 이동 폴백을 EXDEV로 한정(S4), `docs/08` 갱신(S5). 수정 후 `cargo test --workspace` 346개 통과.
- Divergences:
  - **복원 범위가 계획보다 넓어졌다.** 앱의 작업 큐는 항목 오류를 모아 두고 `copy_with`가 일부 실패에도 `Ok`를 돌려준다. 이 경로를 복원하지 않으면 실제 앱에서는 수정이 무의미해서 `OpsError::OverwriteRolledBack`을 더하고 오류 수집 모드 테스트 2개를 추가했다.
  - **기존 테스트 도우미를 고쳤다.** `NoRenameFs`가 "교차 볼륨"을 종류 없는 `io::Error::other`로 흉내 내고 있었고, 옛 코드는 모든 `Io` 오류에서 폴백했기 때문에 통했을 뿐이다. 진짜 오류 종류(`CrossesDevices`)로 바꿨다. 테스트 기대값은 그대로다.
  - **압축뿐 아니라 추출에도 같은 뿌리의 결함이 있었다.** 추출 폴더가 원본 아카이브의 조상일 때(Overwrite) 아카이브가 삭제된다. 리뷰 보고에는 없던 경우라 `resolve_name`에 원본 목록을 넘겨 함께 막았다.
  - **계획의 DoD가 `cargo`에만 머물러 다른 표면의 실패를 놓쳤다.** Rust 오류 문구 3개를 추가하자 `apps/desktop`의 `i18n-rust-messages.test.ts`(Rust 소스의 모든 한국어 리터럴이 `rust.ts` 대응표에 있어야 함)가 실패했다. #143을 실행하며 전체 vitest를 돌리고서야 드러났고, `rust.ts`에 영어 3줄을 추가해 해결했다.

## Learnings
- Do differently next time:
  - 사용자에게 보이는 Rust 오류 문구를 추가·변경하는 계획은 DoD에 `cd apps/desktop && bunx vitest run`(또는 `bun run test`)을 넣고, 작업 목록에 `apps/desktop/src/i18n/rust.ts` 대응표 갱신을 조각으로 적는다. `cargo test`만으로는 이 실패가 보이지 않는다.
  - 테스트용 가짜(`NoRenameFs` 등)가 "어떤 오류든"이라는 넓은 가정에 기대고 있는지 계약을 좁히기 전에 먼저 찾는다. 계약을 좁히면 그 가짜가 첫 번째로 깨진다.
  - 작업 큐 경로(오류 수집 모드)와 직접 호출 경로는 반환 의미가 다르다(`Ok(실패 개수)` vs `Err`). 파일 연산을 고칠 때는 두 경로를 모두 시험한다.
  - 같은 뿌리의 결함은 보고된 사례만 고치지 말고 호출 지점을 열거해 본다(압축 → 추출처럼).
- **확인하지 못한 채 남은 것:** 실제 교차 볼륨(EXDEV) 이동은 실행하지 못했고(가짜로 폴백 경로만 검증), `crosses_devices`의 Windows 분기(ERROR_NOT_SAME_DEVICE=17)는 컴파일 검증뿐이다. 앱에서 덮어쓰기 실패 후 복원되는 모습은 눈으로 확인하지 못했다.
- **이번에 손대지 않고 리뷰에 남긴 항목:** 큐 워커 `catch_unwind` 부재와 FIFO 복사 시 큐 정지, `delete_entry`의 오류 수집, 아카이브→로컬 복사의 `File::create` 선행, 삭제 입력 경로 검증, 충돌 다이얼로그 UX(Esc 부분 실행·단일 문자 `o`·`ask()` 단일 슬롯), mtime·폴더 권한 보존, Windows 예약 이름.

## Doc updates
- CONTEXT.md promotion: none
- ADR added: none (후보 1건을 사용자 확인용으로 제시: "덮어쓰기는 기존 대상을 치워 두고 교체하며 실패하면 복원한다 — 같은 폴더에 `.td-replaced-*` 임시 이름이 생기고, 폴더끼리는 병합이 아니라 교체")
