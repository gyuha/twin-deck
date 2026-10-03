<!-- forge-slug: preview-and-theme -->
<!-- task: 31 -->
<!-- priority: low -->
<!-- tdd: off -->
# 미리보기(텍스트/이미지)와 라이트/다크 테마

## Goal / Non-goals
- Goal: VIEW-01, CFG-03(라이트/다크). `Space`/`Mod+Y`로 커서 항목 미리보기(텍스트는 앞부분 읽기 command, 이미지는 파일 URL 또는 바이트 전달, 그 외는 아이콘·정보만; `preview` 스코프 Esc/Space로 닫기, 미리보기 열림 중 방향키로 항목 이동). Space는 M1에서 선택 토글이었으므로 재배정(선택 토글은 `Insert`만 남기거나 다른 키로 조정하고 docs/05·m1-status 비고를 갱신). 테마 토큰(CSS 변수)과 라이트/다크 전환(설정 `theme`, 시스템 선호 따르기 옵션), 즉시 반영.
- Non-goals: 오디오/비디오 미리보기, 구문 강조, 5종 내장 테마 재현, 사용자 정의 테마 형식.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0007
- Definition of Done: `preview.test.tsx`(텍스트/이미지/기타 종류별 렌더, 키보드 열기·닫기·이동, 큰 파일은 앞부분만) 및 `theme.test.tsx`(라이트/다크 전환이 문서 속성/CSS 변수에 반영, 설정 변경 즉시 반영) 통과. Rust 텍스트 읽기 command 단위 테스트(tempdir, 크기 상한). 재배정한 키가 M1 테스트와 docs에 일관됨. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. Rust 미리보기 데이터 command(텍스트 앞부분, 종류 판별) + Backend 포트/Fake — completion criterion: cargo/ts-client 테스트 통과
- [ ] S2. 미리보기 UI와 `preview` 스코프, Space 재배정 — completion criterion: preview.test.tsx 및 기존 M1 테스트 통과 (depends: S1)
- [ ] S3. 테마 토큰과 라이트/다크 — completion criterion: theme.test.tsx 통과
