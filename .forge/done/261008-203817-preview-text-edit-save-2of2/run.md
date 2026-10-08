# 실행 기록 — 미리보기 텍스트 편집·저장 (이슈 #38, 2/2)

fg-loop 드라이브 중 한 세션에서 직접 처리했다. TDD(`tdd: on`): Rust 서비스 테스트는 `ExpectedFileDto` 부재로 컴파일 단계에서 실패(red), UI 테스트는 `lib/previewEdit` 부재로 실패(red) 상태에서 시작했다.

## 조각별 결과
- S1 실패하는 테스트 — ✅ `service.rs` 6건(`write_text_*`), `preview-edit.test.tsx` 19건(순수 함수 3 + 화면 16).
- S2 Rust 쓰기 명령 — ✅ `write_text_file`(기대 크기·수정 시각 비교, 같은 폴더 임시 파일+이름 바꾸기, 권한 유지, 링크는 실제 파일에 쓰기, 없는 파일·폴더 거절), `commands.rs` 등록, `task gen-types`로 바인딩 갱신(`up_to_date` 통과).
- S3 백엔드 경로 — ✅ `backend.ts` · `tauri.ts` · `fake.ts`(`writes` 기록, `externalWrite`로 밖에서 바뀐 파일 흉내), 타입 내보내기.
- S4 스토어와 대화상자 — ⚠ 계획과 다른 점: 3택 대화상자는 `choice` 종류(선택지 `저장`·`버리기`, 취소는 기본 취소 버튼/Esc)로 만들었다. 덮어쓰기 확인은 새 종류 없이 `confirm`에 `confirmLabel`(`덮어쓰기`)만 더했다. 편집 시작 때 `fileInfo`의 크기를 미리보기를 읽은 때의 크기와 비교해(다르면 거절) 읽기와 편집 시작 사이의 변경도 막는다(계획에 없던 보강).
- S5 화면과 키 — ✅ 본문 더블클릭 → `textarea`, 제목 줄 `편집 중 ●`/`저장됨`, `useKeyboard`에 `[data-preview-edit]` 예외(Mod+S만 통과), `core.preview.save`(`Mod+S`) 액션, `Esc`는 상자가 직접 편집 종료로 처리. 계획에 없던 것: 편집 중 복사 버튼은 편집 버퍼를 복사한다.
- S6 문서 — ✅ `docs/05`(`core.preview.save` 행), `docs/07` §8.

## DoD (baseline → after)
1. `cargo test -p twin-deck-desktop write_text`: 없음(컴파일 실패) → 6건 통과
2. `preview-edit.test.tsx`: 파일 없음 → 19건 통과 (구현 전 실패)
3. `up_to_date`(gen-types 후): 통과 → 통과
4. tsc: 통과 → 통과. vitest 실패: 기준선 4건 → 같은 4건, 새 실패 0건. 통과 987 → 1006. 키바인딩·액션 목록 테스트는 고칠 것이 없었다.
5. clippy·fmt: 통과 → 통과. 전체 `cargo test -p twin-deck-desktop` 56건(전체 실행에서 `coalesce_*` 타이밍 테스트가 한 번 흔들렸고 단독·재실행에서 통과)
6. 문서 grep: `core.preview.save` 0 → 1(`docs/05`), `더블클릭으로 편집` 0 → 1(`docs/07` §8)
7. 실제 앱 확인: **미실시** — 사람이 확인해야 한다(한글 IME 입력, `Mod+S` 후 외부 편집기로 연 내용, CRLF 파일, 밖에서 바꾼 파일의 충돌 대화상자, 편집 중 `Esc`·바깥 클릭).

## 알아 둘 것
- macOS NFD 이름 파일(SMB)은 `canonicalize`가 실패해 저장이 오류로 끝난다. 파일은 쓰지 않으므로 안전하지만 편집은 안 된다(`td-vfs`의 NFD 재시도는 비공개라 범위 밖).
- jsdom은 IME 조합 입력과 실제 파일 시스템 위의 외부 변경 감지를 확인하지 못한다.
