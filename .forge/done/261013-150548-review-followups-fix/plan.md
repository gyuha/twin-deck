<!-- forge-slug: review-followups-fix -->
<!-- task: 144 -->
<!-- generated-by: fg-loop -->
<!-- priority: high -->
<!-- tdd: on -->
# 코드 리뷰 지적 4건을 고친다 (압축 임시 파일 혼입 · 치워 둔 이름 · 성능 · 이동 순서)

## 목표 / 비목표
- 목표: 직전 구현(#142)에 대한 코드 리뷰 지적 중 실제로 맞는 4건을 고친다. (1) 압축 Overwrite가 치워 둔 옛 zip이 새 zip에 들어갈 수 있다. (2) 치워 둔 임시 이름이 숨김 파일이라 비정상 종료 뒤 찾기 어렵다. (4) `is_within`이 조상마다 `canonicalize`를 다시 계산한다. (7) 교차 볼륨 이동 Overwrite에서 원본 삭제가 실패해도 옛 대상을 이미 지운다.
- 비목표: 리뷰 지적 3·5·6(근거를 확인해 기각, `loop.md` 제외 목록 참고), 시작 시 임시 파일 청소 기능, 커밋·푸시.

## 근거(코드로 확인한 사실)
- `crates/td-archive/src/compress.rs`: `compress`는 `dest.exists()`면 `Exists`로 거부하므로 Overwrite는 기존 zip을 먼저 치워야 한다. 워커의 `skip`은 임시 파일과 `dest`만 건너뛰어서, 치워 둔 `.td-replaced-*`가 원본 폴더 안에 있으면 새 zip에 들어간다.
- `crates/td-ops/src/ops.rs`: `displace`가 `.td-replaced-<pid>-<n>`(숨김)을 만든다. `is_within`이 조상마다 `same_entry`(stat 2번 + canonicalize 2번)를 부른다. `move_with`의 EXDEV 분기가 `discard(displaced)` 다음에 `remove_any(src)?`를 부른다.

## 원천(Source of truth)
- 용어: 없음
- 관련 ADR: 없음
- 완료 정의(DoD): `.forge/loop.md`의 C1~C4가 모두 통과한다. 구체적으로:
  1. `cargo test -p td-ops -p td-archive`가 전부 통과하고 아래 새 테스트 3개가 수정 전 빨강 → 초록이다(빨강은 `run.md`에 출력으로 남긴다): `compress_overwrite_into_own_folder_does_not_pack_displaced_zip`, `move_overwrite_across_devices_keeps_old_target_when_source_removal_fails`, `displaced_name_keeps_original_name_visible`.
  2. `cargo test --workspace` 실패 0, `cargo clippy -p td-ops -p td-archive -- -D warnings`, `cargo fmt --check` 통과.
  3. `bun run test`와 `cd apps/desktop && bunx tsc --noEmit` 통과.
  4. 기존 테스트 `overwrite_copy_with_collected_item_errors_restores_old_dir_target`와 `copy_dir_collects_failed_children_and_keeps_going`이 그대로 통과한다(회귀 방지용이라 수정 전에도 통과하는 것이 정상).
  5. 성능 조각(S4)은 동작을 바꾸지 않는 정리라 새 빨강 테스트가 없다. 이유: 결과(참/거짓)가 같고 syscall 횟수는 단위 테스트로 고정할 값이 아니다. 대신 기존 조상·하위 판정 테스트(`overwrite_ancestor_of_source_is_refused_on_copy`, `copy_into_own_child_through_symlink_is_rejected`, macOS의 대소문자 테스트)가 그대로 통과해야 한다.

## 작업 조각(Work slices)
- [ ] S1. 회귀 테스트 3개를 먼저 쓰고 수정 전 빨강을 확인한다. (a) 압축: `X/` 안에 `X.zip`이 이미 있고 `X`를 `X`에 Overwrite로 압축하면 새 zip에 옛 zip(또는 치워 둔 파일)이 들어 있지 않다. (b) 이동: `NoRenameFs`(교차 볼륨 흉내)로 Overwrite 이동하는데 원본 폴더가 쓰기 불가(`chmod 555`)라 복사 뒤 원본 삭제가 실패하면, 오류를 돌려주고 대상은 새 내용이며 옛 내용은 같은 폴더의 치워 둔 항목에 남아 있다. (c) 이름: 치워 둔 임시 이름은 원래 이름을 포함하고 점으로 시작하지 않는다. — 완료 기준: 3개가 수정 전 코드에서 실패한다.
- [ ] S2. `td_archive::compress_skipping(sources, dest, extra_skip, progress)`를 더하고 `compress`는 빈 목록으로 그것을 부르게 한다(호환 유지). `compress_with`는 치워 둔 경로를 `extra_skip`으로 넘긴다. — 완료 기준: S1(a)가 초록. (depends: S1)
- [ ] S3. `displace`의 임시 이름을 `<원래 이름>.td-replaced-<pid>-<n>`로 바꾼다(숨김 아님). `docs/08-vfs-file-ops.md`의 `.td-replaced-*` 문장을 맞춘다. — 완료 기준: S1(c)가 초록, 문서 문장이 새 이름과 일치한다. (depends: S1)
- [ ] S4. `is_within`을 정리한다: `canonical(root)`를 한 번만 계산하고, 조상 순회에서는 `root`의 file_id를 한 번만 읽어 조상의 file_id와 비교한다(조상마다 canonicalize·root stat을 반복하지 않는다). 판정 결과는 바뀌지 않는다. — 완료 기준: DoD 5의 기존 테스트가 그대로 통과한다. (depends: S1)
- [ ] S5. `move_with`의 EXDEV 분기에서 `discard(displaced)`를 `remove_any(src)` 성공 뒤로 옮긴다. 원본 삭제가 실패하면 치워 둔 옛 대상을 지우지 않고 오류를 돌려준다. — 완료 기준: S1(b)가 초록. (depends: S3)
