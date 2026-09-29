# RUN — volumes-and-nav-menus
- S1 td-volumes — ✅ macOS(`/Volumes` + 루트, 루트로 가는 심볼릭 링크 제외), Linux(`/proc/self/mountinfo` 파서 — 순수 함수라 픽스처로 모든 OS에서 테스트, 가상 FS·/run·/snap 등 시스템 마운트 제외, 8진수 이스케이프), Windows(드라이브 문자). 언마운트/추출은 `Unmounter` trait + `Volumes` 가드(루트·목록 밖 경로 거부). `volumes_list_mounts`, `parse_mountinfo_keeps_real_volumes_only`, `unmount_requests_go_through_the_trait_with_guards`
- S2 Tauri command + 포트/Fake — ✅ `list_volumes`/`unmount_volume`/`eject_volume`/`user_dirs`/`add_favorite`; bindings 재생성. `td-config::append_favorite`(기존 주석 보존, 결과가 깨지면 파일을 건드리지 않음)
- S3 팝업 메뉴 — ✅ Volumes(Alt+1)/Favorites(Alt+2, `${user.*}`·`~` 확장, 구분선·그룹 한 단계)/Recent(Alt+3, 탭별 이력에서 파생, C로 비우기)/Hierarchy(Alt+0). 모달(panel 스코프): ↑↓/Return/Esc/숫자키, Volumes에서 U/E
- S4 Go To Path — ✅ Mod+G, Tab 완성(공통 접두어), `~` 확장, 없는 경로는 오류 알림
⚠ fake만 검증: 언마운트/추출(`SystemUnmounter`는 diskutil/umount를 실제로 호출하지 않았다). Windows 볼륨 감지 코드는 컴파일/실행 검증 못 함(cfg(windows)). Linux 실제 mountinfo는 파서 픽스처만.
⚠ 한계: 즐겨찾기 "편집"은 UI가 아니라 config.toml 직접 편집(추가만 액션). 그룹 중첩은 한 단계. 아카이브 안 Go To Path는 M3.
DoD: td-volumes 3, td-config 6, desktop cargo 7, desktop vitest 77 passed.
