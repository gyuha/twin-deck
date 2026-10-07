# RUN — 압축 미리보기 트리가 깊은 경로에서 앱을 죽이지 않게 한다 (리뷰 B)

- S1 red 테스트 — ✅ `archive_tree_lines_deep_path_does_not_overflow_a_small_stack`(깊이 10만, 256KB 스택 스레드)와 `archive_tree_lines_deep_zip_preview_survives_a_small_stack`(직접 쓴 zip, 깊이 3.2만). 구현 전 `stack overflow, aborting`(SIGABRT)으로 중단
- S2 깊이 한도 — ✅ `ARCHIVE_TREE_MAX_DEPTH = 32`. 더 깊은 경로는 32번째에서 `…` 파일 하나로 줄인다

## DoD baseline → after
1. 깊은 경로 테스트 2건: 중단 → 통과
2. 기존 `archive_tree_lines_*` 3건, `preview_archive_*` 3건: 통과 유지(출력 형식 보존)
3. `cargo test -p twin-deck-desktop` 47 → 49 통과, clippy·fmt 통과

## 차이·메모
- 깊이 한도 32는 제가 정한 값이다(근거: 일반 경로는 이보다 훨씬 얕고, 미리보기 줄 수 한도 2000과 prefix 길이를 고려). 한도에 걸린 경로는 `…`로만 보인다.
- 실제 앱 화면에서는 확인하지 못했다.
