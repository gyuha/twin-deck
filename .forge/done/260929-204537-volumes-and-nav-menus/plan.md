<!-- forge-slug: volumes-and-nav-menus -->
<!-- task: 27 -->
<!-- priority: medium -->
<!-- tdd: off -->
# 볼륨 감지와 탐색 보조 메뉴(Volumes/Favorites/Recent/Hierarchy/Go To Path)

## Goal / Non-goals
- Goal: NAV-07~11. `crates/td-volumes`(macOS `/Volumes`+루트, Linux `/proc/self/mountinfo`, Windows 드라이브 문자; 언마운트/추출은 trait로 추상화하고 OS 구현체 제공, 테스트는 fake), Tauri command, `Alt+1/2/3/0` 팝업 메뉴(방향키·숫자키 선택, Return 이동, Esc 닫기), Favorites(설정 파일의 즐겨찾기 + 추가/편집 액션), Recent Locations(탭별, 탭을 닫으면 삭제, 비우기 액션), Hierarchy(루트까지 상위 목록), Go To Path(`Mod+G`, Tab 완성, `~` 확장).
- Non-goals: 아카이브 안 Go To Path, 즐겨찾기 중첩 그룹의 UI 편집(설정 파일 정의는 지원), 실제 언마운트를 실행하는 테스트.

## Source of truth
- Glossary terms: Volumes
- Related ADRs: docs/adr/0005
- Definition of Done: `cargo test -p td-volumes` 이름 지정 테스트 `volumes_list_mounts`(현재 OS에서 루트 볼륨이 포함되고 각 항목이 이름·마운트 경로를 가진다; Linux 파서는 문자열 픽스처로 단위 테스트) 통과, 언마운트 요청이 trait를 통해 전달됨을 fake로 검증. `menus.test.tsx` 통과(네 메뉴의 열기/선택/닫기, Recent가 탭별로 독립이며 탭 닫기와 비우기로 사라짐, Go To Path Tab 완성). 모두 키보드. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. td-volumes(감지, OS별 파서, 언마운트 trait) — completion criterion: `volumes_list_mounts` 통과
- [ ] S2. Tauri command + Backend 포트/Fake — completion criterion: cargo/ts-client 테스트 통과 (depends: S1)
- [ ] S3. 팝업 메뉴 컴포넌트와 Volumes/Favorites/Recent/Hierarchy 액션 — completion criterion: menus.test.tsx 해당 케이스 통과 (depends: S2)
- [ ] S4. Go To Path 다이얼로그와 Tab 완성 — completion criterion: menus.test.tsx 해당 케이스 통과 (depends: S2)
