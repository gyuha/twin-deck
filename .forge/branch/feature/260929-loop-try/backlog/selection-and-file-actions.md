<!-- forge-slug: selection-and-file-actions -->
<!-- task: 15 -->
<!-- priority: medium -->
<!-- tdd: off -->
# 선택 확장과 파일 액션(복제, 정보, 경로 복사, 열기 계열)

## Goal / Non-goals
- Goal: SEL-03/04, OP-08/09/10/13/14/15/16. 선택 반전/현재 항목 반전, Select/Deselect Group(glob 패턴 입력, Rust 또는 TS 매처 `glob_group_match`), 복제(`Mod+D`, 이름에 접미사 `duplicate_suffix`), 비활성 패널로 복사/이동(대화상자 없음, 기본 키 없음), 삭제/휴지통 확인 on/off 설정 연동(OP-13), 파일 정보(`Mod+I`, 이름/경로/종류/크기/생성·수정·접근 시각/권한 `file_info_fields`), 폴더/파일 경로 복사(F12/Mod+F12, 클립보드 trait), 파일 관리자에서 보기(reveal trait), 편집/폴더 편집(F4/Shift+F4, 설정의 편집기 명령을 launcher trait로 실행). OS 부작용은 trait로 추상화하고 테스트는 fake.
- Non-goals: Open With(M3), 압축/추출, 심볼릭 링크 만들기.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0007
- Definition of Done: 이름 지정 Rust 테스트 `duplicate_suffix`, `file_info_fields`, `glob_group_match` 통과. `cargo test`에서 클립보드/reveal/launcher가 trait fake로 호출 인자를 검증. vitest로 각 액션의 키 동작(반전, 그룹 선택 입력 다이얼로그, 복제, 정보 다이얼로그 표시, 확인 옵션 off일 때 다이얼로그 없이 실행)과 ACT-02 컨텍스트 조건. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. SEL-03/04 (반전, 그룹 선택, glob 매처) — completion criterion: `glob_group_match` 및 vitest 통과
- [ ] S2. OP-08 복제, OP-10 비활성 패널로 복사/이동 — completion criterion: `duplicate_suffix` 및 vitest 통과
- [ ] S3. OP-14 정보, OP-15 경로 복사, OP-16 reveal, OP-09 편집 (trait fake) — completion criterion: `file_info_fields` 및 vitest 통과
- [ ] S4. OP-13 확인 on/off 연동 — completion criterion: vitest 통과 (depends: td-config 태스크가 먼저 봉인되면 설정 연동, 아니면 기본값 유지 후 연결)
