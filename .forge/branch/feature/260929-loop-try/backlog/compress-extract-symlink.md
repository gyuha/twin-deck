<!-- forge-slug: compress-extract-symlink -->
<!-- task: 27 -->
<!-- priority: medium -->
<!-- tdd: off -->
# 압축, 추출, 심볼릭 링크 만들기

## Goal / Non-goals
- Goal: OP-11 압축(선택 항목 → 같은 폴더에 `<이름>.zip`, 여러 개면 폴더 이름 기반, 이름 충돌 시 번호), 추출(아카이브 → 그 옆 `<이름>` 폴더 또는 `core.extract`가 비활성 패널로; 항상 안전 추출·zip-slip 거부), 큐 작업으로 실행(진행/중단), 원본은 지우지 않는다. OP-12 심볼릭 링크 만들기(`core.file.symlink`: 커서 항목을 비활성 패널 폴더에 링크로 생성, 이름 충돌 처리), Windows 권한 오류는 원인과 안내 메시지로 변환하는 순수 함수(`symlink_error_message`). UI 액션과 다이얼로그.
- Non-goals: 압축 옵션 UI, 다른 형식으로 압축, 암호화.

## Source of truth
- Glossary terms: 큐
- Related ADRs: docs/adr/0005, 0012
- Definition of Done: Rust `compress_extract_roundtrip_external`(우리가 압축한 zip을 **시스템 `unzip`으로 풀어** 원본과 바이트 일치, **시스템 `zip`으로 만든 zip을 우리 추출로 풀어** 일치, 한글 이름·빈 폴더·심볼릭 링크 없는 트리), `symlink_create`(unix에서 링크 생성·대상 확인·충돌 처리), `symlink_error_message`(Windows 권한 오류 코드 → 안내 문구 표 테스트). `compress-symlink.test.tsx`(압축/추출/링크 액션 흐름, 큐 진행, 충돌, 원본 유지) 통과. `cargo test --workspace`, `bun run typecheck && bun run test && bun run build` 통과.

## Work slices
- [ ] S1. 압축/추출 로직과 큐 작업 종류 — completion criterion: `compress_extract_roundtrip_external` 통과
- [ ] S2. 심볼릭 링크 — completion criterion: `symlink_create`, `symlink_error_message` 통과
- [ ] S3. Tauri 연결과 UI 액션 — completion criterion: compress-symlink.test.tsx 통과 (depends: S1, S2)
