<!-- forge-slug: permanent-delete-vanished-companion -->
<!-- task: 150 -->
<!-- tdd: on -->
<!-- priority: high -->
# 영구 삭제: 지우는 중 이미 사라진 항목(`._*` 보조 파일)을 실패로 보지 않는다 (#54)

## 목표 / 하지 않을 것
- 목표: macOS의 exFAT·FAT32·SMB 볼륨에서 파일이 들어 있는 폴더도 영구 삭제(`core.delete`)가 끝까지 되게 한다.
- 원인(재현으로 확인함): `td-ops`의 `delete_entry`는 폴더 목록을 먼저 읽은 뒤 항목을 차례로 지운다. 이런 볼륨에서는 macOS가 파일마다 `._이름` 보조 파일(AppleDouble)을 만들고, 원본 `b.txt`를 지울 때 `._b.txt`도 함께 지운다. 그래서 목록에 남아 있던 `._b.txt`를 지우려는 순간 `NotFound`가 나고 작업이 실패한다. 재현: exFAT 디스크 이미지에서 `delete_with`가 `NotFound(".../sub/._b.txt")`로 실패, 로컬 임시 폴더에서는 통과.
- 하지 않을 것:
  - `._*` 파일을 이름으로 건너뛰거나 따로 처리하지 않는다(사용자가 정함: NotFound를 성공으로 넘기는 방식).
  - `delete_entry` 밖은 바꾸지 않는다. 이동의 원본 정리·충돌 처리는 `remove_any`(OS의 `remove_dir_all`)라 같은 문제가 없다.
  - 복사·압축·추출에서 같은 보조 파일이 문제를 일으키는지는 다루지 않는다. #55(USB 압축 실패)와 같은 계열인지는 별개로 확인한다.
  - 이슈에 댓글을 달거나 닫는 일은 하지 않는다.

## 근거 자료
- 이슈 추적: GitHub 이슈 #54
- 용어: 없음 (`.forge/CONTEXT.md`에 해당 용어 없음). 관련 ADR: 없음(`.forge/adr/` 자체가 없음).
- 코드: `crates/td-ops/src/ops.rs`의 `delete_with`/`delete_entry`(영구 삭제의 큐 경로). `delete_entry`는 영구 삭제에서만 쓰인다.
- 완료 정의(DoD): 아래 "작업 조각"의 완료 기준과 "검증"의 명령이 모두 맞다.

## 작업 조각
- [ ] S1. 실패하는 테스트 먼저 — 완료 기준: `crates/td-ops/tests/ops.rs`에 `delete_with_ignores_companion_removed_during_delete`가 있고, 수정 전에는 실패(빨강)한다. 테스트는 `Control::on_item`에서 `a.txt`를 만나는 순간 `._a.txt`를 지워 macOS의 동작을 흉내 낸다(폴더에 `a.txt`, `._a.txt`, 하위 폴더 안 같은 쌍을 둔다). 디스크 이미지를 쓰지 않는다.
- [ ] S2. `delete_entry` 수정 — 완료 기준: 파일·폴더를 지우다 `NotFound`(`VfsError::NotFound`)를 만나면 이미 사라진 것으로 보고 성공으로 넘기고 진행 알림(`on_file_done`)은 그대로 한다. 다른 오류(권한 등)는 지금처럼 실패한다. S1 테스트가 통과하고, 없는 경로를 `delete_with`에 직접 주면 지금처럼 오류를 돌려준다는 것(최상위 대상이 없을 때의 `stat` 오류)도 테스트로 확인한다.

## 검증 (작성 시점에 한 번씩 돌려 본 상태)
- `cargo test -p td-ops delete_with_ignores_companion_removed_during_delete` → 통과. 지금은 테스트가 없어 0건 실행이다(`running 0 tests`). 앞으로 맞춰야 하는 확인이다(S1에서 먼저 빨강, S2에서 초록).
- `cargo test -p td-ops` → 통과. 지금도 통과한다(회귀 가드, 기존 테스트 전부 ok).
- `cargo clippy -p td-ops -- -D warnings` → 통과. 지금도 통과한다(회귀 가드).
- 수동 점검(macOS, 자동 검증 아님): `hdiutil create -size 20m -fs ExFAT -volname TD54EX -type SPARSE /tmp/ex.sparseimage` → `hdiutil attach` 후 폴더에 파일과 하위 폴더를 만들고, 앱에서 영구 삭제(`Shift+F8`)로 폴더가 사라지는지 본다. 끝나면 `hdiutil detach`와 이미지 삭제. 작성 시점에 같은 이미지에서 `delete_with`가 위 오류로 실패하는 것을 확인했다.
- 한계: 보고자의 실제 환경(OS 버전, USB 포맷, 오류 문구)은 확인하지 못했다. 이 수정이 보고자의 증상과 같은 원인이라는 것은 증상 설명이 맞아떨어지는 추정이다 [중간]. 실행 결과(run.md)에 그대로 적는다.
