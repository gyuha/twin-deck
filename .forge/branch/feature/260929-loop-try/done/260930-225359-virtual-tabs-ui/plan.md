<!-- forge-slug: virtual-tabs-ui -->
<!-- task: 26 -->
<!-- priority: medium -->
<!-- tdd: off -->
# 가상 탭과 Look Up/Flatten/Disk Usage UI

## Goal / Non-goals
- Goal: PANE-06, FIND-01~06 화면. 위치가 없는 **가상 탭** 타입(제목 "Look Up: …"/"Flatten"/"Disk Usage"), 결과가 스트리밍으로 도착하며 진행 표시와 취소(Esc 또는 액션), Look Up 다이얼로그(전역 `Mod+P` = 홈 범위, 현재 폴더 `Mod+Alt+P`, 지원하지 않는 변수 경고 표시), `core.flatten`, `core.disk_usage`(인수로 대상), 가상 탭 항목도 일반 항목처럼 선택·복사·이동·삭제 가능하고 "해당 폴더로 이동" 액션(`core.reveal_in_tab`류)으로 실제 위치로 갈 수 있으며 탭을 닫으면 결과를 버린다. Tauri command/event 연결(`bindings.ts` 재생성), FakeBackend 검색 흉내(수동 스텝 가능).
- Non-goals: 결과 정렬 UI 세부, 검색 히스토리, Spotlight.

## Source of truth
- Glossary terms: 가상 탭
- Related ADRs: docs/adr/0007
- Definition of Done: `lookup-ui.test.tsx`(질의 다이얼로그, 스트리밍 결과 도착, 취소, 경고, 범위) 및 `virtual-tabs.test.tsx`(가상 탭 생성·제목·닫기, 항목 선택/복사/삭제가 원래 위치에 적용, 위치로 이동, Flatten/Disk Usage 결과 표시와 크기 내림차순, 아카이브 안 대상) 통과. 키보드 위주. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. Tauri command/event와 Backend 포트/Fake — completion criterion: cargo/ts-client 테스트 통과
- [ ] S2. 가상 탭 모델과 표시(탭 종류, 스토어, FileTable 재사용) — completion criterion: virtual-tabs.test.tsx 해당 케이스 통과 (depends: S1)
- [ ] S3. Look Up 다이얼로그와 스트리밍/취소 — completion criterion: lookup-ui.test.tsx 통과 (depends: S2)
- [ ] S4. Flatten, Disk Usage 액션 — completion criterion: virtual-tabs.test.tsx 나머지 통과 (depends: S2)
