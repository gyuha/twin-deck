<!-- forge-slug: td-vfs-local -->
<!-- task: 16 -->
<!-- priority: high -->
<!-- tdd: off -->
# td-vfs: Vfs trait와 로컬 파일시스템 구현

## Goal / Non-goals
- Goal: docs/08-vfs-file-ops.md, ADR-0005대로 `crates/td-vfs`에 `VfsPath`, `Vfs` trait, `LocalFs`(목록/stat/mkdir/create/rename/remove/copy 프리미티브)를 구현하고 macOS NFD 한글 정규화를 지원하는 정렬/일치 유틸을 둔다.
- Non-goals: ArchiveFs(M3), 볼륨 감지, 큐, 파일 감시(다른 태스크).

## Source of truth
- Glossary terms: VFS, VfsPath
- Related ADRs: docs/adr/0004, 0005
- Definition of Done: `cargo test -p td-vfs`가 통과. 테스트는 tempdir에서 실제 디스크 사용. 반드시 이름 있는 테스트 `nfd_korean_sort`(NFD/NFC 혼합 한글 파일명이 정규화 후 올바른 순서로 정렬)와 `nfd_korean_quick_select`(NFD로 저장된 한글 이름이 NFC 입력 접두어에 일치)가 존재하고 통과. 목록 조회 결과는 이름·종류·크기·수정시각·숨김 여부 포함. 숨김 파일 판별은 OS별(점 시작, Windows 속성)로 분리 구현.

## Work slices
- [ ] S1. `VfsPath`, `Vfs` trait, 에러 타입(thiserror) — completion criterion: 컴파일 및 trait 사용 단위 테스트 통과
- [ ] S2. `LocalFs` list/stat/mkdir(중첩)/create_file/rename/remove — completion criterion: tempdir 통합 테스트 통과 (depends: S1)
- [ ] S3. 한글 NFD 정렬/접두 일치 유틸 (`unicode-normalization`) — completion criterion: `nfd_korean_sort`, `nfd_korean_quick_select` 통과 (depends: S1)
- [ ] S4. 숨김 파일 판별과 필터 옵션 — completion criterion: 점 파일이 필터로 숨겨지고 옵션으로 표시되는 테스트 통과 (depends: S2)
