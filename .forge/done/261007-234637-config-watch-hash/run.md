# RUN — 설정 감시가 같은 크기·같은 시각 편집도 놓치지 않게 내용을 비교한다 (리뷰 H)

- S1 red 테스트 — ✅ `config_watch_same_size_edit_with_same_mtime_is_still_seen`: `config.toml`을 같은 길이의 다른 값(`16`→`18`)으로 쓰고 `File::set_modified`로 수정 시각을 되돌린 뒤 재로딩이 오는지 본다. 구현 전 5초 안에 이벤트가 오지 않아 실패(첫 시도는 길이를 하드코딩한 단언 오류로 엉뚱한 곳에서 실패해 바로잡았다)
- S2 구현 — ✅ 서명을 (시각, 크기) → 두 설정 파일의 내용으로 바꾸고, 기준 서명을 `load_dir` 앞에서 구해 스레드로 넘긴다. `store.ts`의 낡은 주석 정정

## DoD baseline → after
1. 신규 1건: red → 통과
2. 기존 `config_watch_reload`·`config_watch_ignores_unrelated_files` 포함 td-config 27 → 28건 통과, clippy 통과
3. `grep -c '어떤 파일이 바뀌어도' store.ts` 1 → 0

## 차이·메모
- 시작 직후의 "기준 서명 ↔ 첫 읽기" 사이 경쟁은 순서만 바꿔 구조적으로 막았고, 이를 결정적으로 재현하는 테스트는 만들지 못했다(타이밍에 의존). 설계상 보장일 뿐 검사로 고정되어 있지 않다.
- 폴링(1초)마다 두 파일을 읽는다(수 KB).
