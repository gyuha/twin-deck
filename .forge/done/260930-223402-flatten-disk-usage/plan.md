<!-- forge-slug: flatten-disk-usage -->
<!-- task: 39 -->
<!-- priority: medium -->
<!-- tdd: off -->
# Flatten과 Analyze Disk Usage 엔진

## Goal / Non-goals
- Goal: `td-search`(또는 형제 모듈)에 Flatten(FIND-05: 하위 모든 파일을 평면 목록으로, 폴더는 넣지 않음, 링크는 따라가지 않고 링크 자체를 한 항목으로, 스트리밍·취소)과 Disk Usage(FIND-06: 대상 폴더의 하위 항목별 총 크기를 병렬 계산해 크기 내림차순, 진행 중 부분 결과 갱신, 취소, 하드 링크는 한 번만, 심볼릭 링크는 따라가지 않음, 볼륨 경계는 옵션 `cross_volumes` 기본 false)를 구현한다. `Vfs` 기반이라 아카이브 안에서도 동작한다(크기는 항목의 압축 해제 크기).
- Non-goals: UI, 캐시, 인덱스.

## Source of truth
- Glossary terms: 가상 탭
- Related ADRs: docs/adr/0004, 0005
- Definition of Done: `cargo test` 통과: `flatten_lists_files_only`(폴더 제외, 링크는 링크 자체 1항목이며 따라가지 않음(순환 링크가 있어도 종료), 아카이브 안에서도 동작), `disk_usage_sizes`(알려진 크기의 트리에서 하위 항목별 총합이 정확하고 내림차순, 아카이브 안에서도 정확), `disk_usage_hardlink_once`(같은 inode의 하드 링크 두 개가 한 번만 합산 — unix), `disk_usage_cancel`(취소하면 멈추고 부분 결과가 유효). 볼륨 경계 옵션은 기본 false를 확인하는 단위 테스트.

## Work slices
- [ ] S1. Flatten — completion criterion: `flatten_lists_files_only` 통과
- [ ] S2. Disk Usage 병렬 계산과 하드 링크 처리 — completion criterion: `disk_usage_sizes`, `disk_usage_hardlink_once` 통과
- [ ] S3. 취소와 부분 결과, 옵션 — completion criterion: `disk_usage_cancel` 통과 (depends: S2)
