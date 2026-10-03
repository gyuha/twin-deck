# RUN — 파일 찾기 검색 엔진과 백엔드 연결 (find-engine-backend)

실행 방식: 메인 세션에서 직접 실행(Dynamic Workflow 없음, `running.md` 없음).

## 슬라이스별 결과
- S1 `td-search::find`(`FindSpec`, `Finder`, `TextSpec`)와 Rust 테스트 9종 — ✅ 계획대로(계획의 8종 + `find_only_items_cancel_and_roots`). `regex` 의존성은 `td-search`에만 추가. 계획과 달라진 점: 순회는 기존 `walk`를 쓰지 않고 `find.rs`에 깊이·제외·심볼릭 링크 순환 방지가 있는 별도 순회를 뒀다(기존 `walk`는 Look Up/Flatten이 계속 쓴다)
- S2 `service::start_find`, Tauri 명령 `start_find`, `FindSpecDto`/`TextSpecDto`, 바인딩 재생성, 서비스 테스트 `start_find_streams_matches` — ✅ 계획대로
- S3 TS `Backend.startFind`·tauri·`FakeBackend.startFind`(Rust와 같은 규칙) + 단위 테스트 — ✅ 계획대로 (`index.ts`에서 `FindSpecDto`/`TextSpecDto` 내보냄)
- S4 전체 회귀·품질 확인 — ✅ 계획대로

## DoD baseline → after
1. `cargo test -p td-search` find 테스트: 없음 → 9개 모두 ok (전진). 실제 `LocalFs`와 `tempfile` 폴더로 검증. 순환 심볼릭 링크(자기 부모를 가리킴)는 따라가기를 켜도 끝나고(`visited < 100`) 같은 파일이 두 번 나오지 않는다.
2. `cargo test -p twin-deck-desktop start_find`: 없음 → `start_find_streams_matches ... ok`.
3. 잘못된 정규식(마스크·텍스트 모두)은 시작 즉시 오류 문자열로 거부(Rust 테스트와 서비스 테스트에서 확인).
4. `grep -c "startFind\|FindSpecDto" bindings.ts`: 0 → 2, 환경 변수 없이 `up_to_date` 통과.
5. ts-client vitest 47 passed(새 테스트 2: 마스크·깊이·제외·정규식·텍스트·invert·선택 항목), `bun run typecheck` 0.
6. 회귀 방지(사전 통과 → 그대로): `cargo test --workspace` 0, fmt 0, clippy(-p td-search -p twin-deck-desktop) 0, vitest 470 passed·실패는 기존 pdf-preview 1건.

## 발견한 것
- **버그 1건을 테스트가 잡았다:** 제외 마스크가 비어 있을 때 "모든 이름 일치"로 처리되어 결과가 전부 사라졌다. 찾기 마스크는 비면 `Any`(모두 일치), 제외 마스크는 비면 `Never`(아무것도 일치하지 않음)여야 해서 `NameMask::Never`를 추가해 고쳤다.
- 제외 마스크는 항상 glob이고 와일드카드 없는 토큰은 이름이 정확히 같아야 한다(`node`가 `node_modules`를 제외하지 않게). Double Commander의 정확한 규칙은 확인하지 못했다 `[알 수 없음]`.
- 텍스트 찾기는 앞 8KB에 NUL이 있으면 바이너리, 16MB 초과는 건너뛰고 건너뛴 수를 요약 경고로 알린다. 내용 쪽은 NFC 정규화를 하지 않는다(NFD로 저장된 한글 내용과 NFC 검색어는 맞지 않을 수 있다).
- 아카이브 안 검색은 비목표라 다루지 않았다(`td-vfs`의 아카이브 경로는 순회에서 일반 폴더처럼 취급되지만 검증하지 않았다).
