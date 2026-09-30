<!-- forge-slug: archive-ui -->
<!-- task: 23 -->
<!-- priority: high -->
<!-- tdd: off -->
# 아카이브 UI: 폴더처럼 열기, Open As, 편집 되쓰기

## Goal / Non-goals
- Goal: ARC-01/03/04 화면 쪽. 목록에서 아카이브 파일에 Enter → 그 아카이브를 폴더처럼 연다(`x.zip!/`), 브레드크럼에 아카이브 경계 표시, 아카이브 루트에서 Backspace/상위 이동 → 아카이브가 들어 있는 폴더로(커서는 그 아카이브 파일), 중첩 아카이브도 같다. 임의 파일을 아카이브로 여는 `core.open.as_archive`(ARC-04, 기본 키 없음). 아카이브 안 파일을 편집(F4)하면 임시로 추출해 편집기로 열고 **임시 파일이 바뀌면 아카이브에 자동 반영**(`archive_edit_writes_back`: 감시 + 되쓰기, 편집기 실행은 trait fake). 설정 `file_systems.zip.additional_extensions`를 반영. 아카이브 안에서 지원하지 않는 액션(휴지통 등)은 명확한 안내.
- Non-goals: 아카이브 안 Look Up(다음 태스크들에서 Vfs 기반이라 자동으로 되면 좋음), 진행률 상세.

## Source of truth
- Glossary terms: 패널, VfsPath
- Related ADRs: docs/adr/0005, 0012
- Definition of Done: Rust `archive_edit_writes_back`(임시 추출 → 임시 파일 수정 → 제한 시간 안에 아카이브에 반영, 시스템 `unzip -p`로 확인, 편집기 실행은 recording fake) 통과. `archive-nav.test.tsx` 통과(Enter로 열기, 중첩, 상위 이동 시 커서, 브레드크럼, `additional_extensions` 설정 반영, Open As, 아카이브 안 휴지통 액션의 안내, 아카이브 안 복사/삭제 흐름). 키보드 위주. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. 경로 처리 TS 측(parentPath/breadcrumb/isArchive 판정) — completion criterion: 단위 테스트
- [ ] S2. 열기/상위 이동/Open As 액션과 설정 — completion criterion: archive-nav.test.tsx 해당 케이스 통과 (depends: S1)
- [ ] S3. 편집 되쓰기(Rust 임시 추출+감시+되쓰기, command, UI 연결) — completion criterion: `archive_edit_writes_back` 및 UI 케이스 통과 (depends: S2)
