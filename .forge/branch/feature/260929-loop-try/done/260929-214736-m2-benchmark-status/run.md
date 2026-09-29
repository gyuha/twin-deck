# RUN — m2-benchmark-status
- S1 벤치마크 — ✅ `docs/m2-benchmark.md`. Rust는 release 빌드 3회 중앙값, JS는 Node/jsdom 3회. 측정 도구: `large_dir_100k_list`(td-vfs, 실제 디스크 100_000개), `large_dir_100k_dto_json`(IPC 페이로드 직렬화), `bench.test.tsx`(`BENCH=1`일 때만 값을 출력, 상한 검사 없이 정확성만).
  - **임계값을 넘은 항목의 원인 분석과 조치**: Rust `sort_entries`가 10만 항목에서 711 ms(가설 임계값 300 ms 초과) — 비교마다 이름을 정규화·소문자화하며 문자열을 할당하던 것이 원인. `sort_by_cached_key`로 키를 한 번만 만들게 바꿔 34 ms(약 21배). 정렬 결과 동일성은 `sort_entries_matches_compare_names_semantics`가 이전 comparator 방식과 대조.
  - 판정: 열기 약 550 ms(가설 1000 ms 이내), 정렬 300 ms 이내, DOM 행 28개(≤200) 만족. **스크롤 프레임·IPC 전송·실제 웹뷰 렌더는 측정하지 못했고**, 열 때 `JSON.parse` 71 ms + 정렬 63~143 ms로 메인 스레드가 50 ms 이상 연속 묶이는 구간이 있어 "UI가 멈추지 않는다" 기준은 절반만 확인됨(문서에 그대로 적음).
- S2 `keyboard-scenario-m2.test.tsx` — ✅ 마우스 조작 0건. 볼륨 메뉴 → Go To Path → 크기 정렬 → 패턴 선택 → 큐 복사(일시정지/재개) → Actions Panel 복제 → 미리보기 → 상태 저장.
- S3 `docs/m2-status.md` — ✅ P1 32개 ID, 각 행 `done`+존재하는 테스트 경로, OS 부작용 5개 항목(PANE-03, NAV-07, OP-09, OP-15, OP-16)은 비고에 `fake만 검증`. docs/11 M2 완료 기준 대조와 알려진 한계 포함.
⚠ 계약 정정(C7): 패턴 `xit\(`가 `app.exit(0)`의 `exit(`에 걸리는 오탐이어서 단어 경계 `\bxit\(`로 바로잡음. 코드를 꼬아 쓰지 않았고, 진짜 `xit(`는 여전히 검출됨을 확인. loop.md에 기록.
DoD: cargo test --workspace 66, vitest keybinds 15 / actions 19 / ts-client 40 / desktop 189.
