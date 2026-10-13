# 실행 기록 — permanent-delete-vanished-companion (#54)

## 슬라이스 결과
- S1 실패하는 테스트 `delete_with_ignores_companion_removed_during_delete` 추가(`crates/td-ops/tests/ops.rs`) — ✅ 수정 전 빨강 확인(`Vfs(NotFound(".../sub/._b.txt"))`, 실제 exFAT에서 본 것과 같은 오류)
- S2 `delete_entry`가 지우다 `NotFound`를 만나면 성공으로 넘김(`ignore_vanished`, `crates/td-ops/src/ops.rs`) — ✅ 계획대로. 최상위 대상이 없을 때는 `stat`에서 오류가 나는 것을 같은 테스트가 확인

## DoD baseline → after
- `cargo test -p td-ops delete_with_ignores_companion_removed_during_delete`: 0건 실행 → 1 passed (수정 전 1 failed 확인)
- `cargo test -p td-ops`: 전부 ok → 전부 ok (회귀 가드, 기준선도 통과)
- `cargo clippy -p td-ops -- -D warnings`: 통과 → 통과 (회귀 가드)
- 수동 점검(exFAT 디스크 이미지): 수정 전 `delete_with`가 NotFound로 실패 → 수정 후 폴더(`full/a.txt`, `full/sub/b.txt`)가 모두 지워지고 볼륨에 `.fseventsd`만 남음. 임시 테스트와 이미지는 지웠다.

## 계획과 다른 점 · 한계
- `cargo fmt -p td-ops`로 테스트 코드 한 줄을 접었다(기능 변화 없음).
- 앱 UI에서 `Shift+F8`로 지우는 수동 점검은 하지 않았다. exFAT에서는 `td-ops`의 `delete_with`를 직접 호출해 확인했다. 큐·UI 경로(`queue_runs_copy_move_trash_delete_jobs`)는 기존 테스트만 돌렸다.
- 보고자의 실제 환경(OS 버전, USB 포맷, 오류 문구)은 확인하지 못했다. 같은 원인이라는 것은 증상이 맞아떨어지는 추정이다 [중간].
- 커밋하지 않았다. 이슈 #54에 댓글을 달거나 닫지 않았다.
