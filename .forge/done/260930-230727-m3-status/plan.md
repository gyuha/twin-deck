<!-- forge-slug: m3-status -->
<!-- task: 42 -->
<!-- priority: low -->
<!-- tdd: off -->
# M3 종단 시나리오와 상태 문서

## Goal / Non-goals
- Goal: 앞선 M3 태스크가 모두 반영된 상태에서 (1) 키보드 전용 종단 시나리오 `keyboard-scenario-m3.test.tsx`(zip 열기 → 안의 파일을 로컬로 복사 → 로컬 파일을 zip에 추가 → Look Up으로 찾기 → 가상 탭에서 복사 → Disk Usage → 압축/추출), (2) `docs/m3-status.md`에 ID 13개를 `| ID | done | 테스트 경로 | 비고 |` 행으로 정리(ARC-02 비고에 `rar 미지원`, fake로만 검증한 항목은 `fake만 검증`, 범위 밖 M3 항목 목록, docs/11 M3 완료 기준 대조), (3) THIRD_PARTY_NOTICES.md에 새 의존 crate 라이선스 정리.
- Non-goals: 새 기능.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: `keyboard-scenario-m3.test.tsx` 통과·마우스 0건, `docs/m3-status.md` 13개 ID 행(done이면 테스트 경로 실재), 범위 밖 목록, THIRD_PARTY_NOTICES.md 갱신. 전체 게이트와 정지 조건 C1~C12.

## Work slices
- [ ] S1. `keyboard-scenario-m3.test.tsx` — completion criterion: 통과, 마우스 0건
- [ ] S2. `docs/m3-status.md`와 docs/11 M3 대조 — completion criterion: 13개 ID 행, 경로 실재
- [ ] S3. THIRD_PARTY_NOTICES.md — completion criterion: 새 crate 라이선스 나열
