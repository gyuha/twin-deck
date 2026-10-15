# 실행 기록 — 릴리스 페이지(GitHub) 링크 열기: 설정 버튼과 액션 (이슈 #70)

fg-loop 구동 중 직접 실행했다(tdd off).

## 슬라이스별 결과
- S1 Rust — ✅ 계획대로. `service.rs`에 `RELEASES_URL`·`open_releases`(`Launch::open` 재사용)와 가짜 실행기 테스트, `commands.rs`에 인수 없는 `open_releases_page`를 등록하고 `task gen-types`로 바인딩을 다시 만들었다.
- S2 브리지·UI — ⚠ 첫 `tsc`에서 테스트의 속성 이름 오류(`Binding.action` → `actionId`)가 잡혔다. 고쳤다. `Backend.openReleasesPage`·`tauri.ts`·`fake.ts`(`openedUrls`)·스토어 api·액션 메타 `core.app.releases`(기본 키 없음)·핸들러·설정 버튼·ko/en 문구·테스트 4건을 더했다.
- S3 문서 — ✅ 계획대로. `docs/05` 액션 행, `README.md`·`README.en.md` 업데이트 절에 한 줄씩(한·영 쌍).

## DoD baseline → after
1. `cargo test open_releases`: 0건 → 1건 통과(macOS `open`·Windows `explorer`·Linux `xdg-open`, 인수 정확히 `https://github.com/gyuha/twin-deck/releases`).
2. `releases-link.test.tsx`: 없음 → 4 passed.
3. `bindings.ts openReleasesPage`: 0 → 1, `up_to_date` 통과 → 통과.
4. `tsc` 통과, vitest 전체 1360건·`packages/actions` 19건 통과.
5. clippy `-p twin-deck-desktop -D warnings`·`fmt --check` 통과 → 통과(회귀 방어).
6. `docs/05 core.app.releases` 0 → 1, `README.md **변경 사항**` 0 → 1, `README.en.md Release notes` 0 → 1.

## 계획과 다른 점
- 환경: 다른 세션의 HWP 작업이 추가한 `@rhwp/core`가 이 컴퓨터에 설치돼 있지 않아 vitest가 `Failed to resolve import "@rhwp/core"`로 실패했다. `bun install --frozen-lockfile`로 설치했다(저장소 파일은 바뀌지 않음).
- `fake.ts`의 `openReleasesPage`는 주소를 상수로 따로 기록한다(실제 주소는 Rust 상수가 정함). 그래서 화면 테스트의 주소 단언은 fake 기준이고, 실제 주소는 Rust 테스트(C1)가 보증한다.

## 알려진 한계
- 실제로 브라우저가 열리는지는 자동으로 증명하지 못했다(특히 Windows `explorer <URL>`, Linux `xdg-open`). 앱에서 눌러 확인해야 한다.
