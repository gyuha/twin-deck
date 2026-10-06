<!-- forge-slug: statusbar-selection-summary -->
<!-- task: 64 -->
<!-- tdd: on -->
# 상태 줄에 선택/전체 용량·파일·폴더 수를 표시한다 (Double Commander 방식)

## Goal / Non-goals
- Goal: 상태 줄의 `선택 N개`를 Double Commander처럼 `선택: 12.3 MB / 45.7 MB, 파일: 2/6, 폴더: 1/2`로 바꾼다. 선택이 없으면 `선택: 0 / 45.7 MB, 파일: 0/6, 폴더: 0/2`다. 활성 패널만 보여 주고, 패널을 바꾸면 그 패널 값으로 바뀐다.
- 규칙: 전체는 지금 목록에 보이는 항목만 센다(숨김 표시가 꺼져 있으면 숨김 파일은 빠지고 `..`은 세지 않는다). 용량은 파일 크기만 더하고(심볼릭 링크는 파일로 셈) 선택한 폴더 안의 파일 크기는 더하지 않는다. 크기 표기는 소수점 한 자리(`12.3 MB`)이고 설정의 `크기 형식`을 따른다.
- Non-goals: 폴더 안 용량(재귀) 합산, 비활성 패널의 요약, 새 설정 키, 상태 줄의 다른 요소(알림, 경고, 토글 버튼) 변경.
- 이슈 추적: 없음(사용자 직접 요청)

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "선택 요약"` → 통과 ≥ 1, 실패 0. 선택 없음/파일만/폴더 포함/전체 선택, 숨김 파일 표시 전환 시 전체 수 변화, 패널 전환 시 값 변화, `크기 형식` 설정(바이트) 반영, 선택한 폴더 용량은 더하지 않음을 단언한다. 작성 시점 pre-state: 0 tests(`640 skipped`로 필터가 비면 통과로 보이니 "passed ≥ 1"까지 확인). 전진 검사.
  2. 기존 `선택 N개`를 확인하던 테스트 3개(`keyboard-scenario.test.tsx` 2곳, `navigation.test.tsx` 1곳)가 새 형식(`파일: n/전체`, `선택: ...`)에 맞게 바뀐 뒤 통과한다. 작성 시점 pre-state: 옛 형식으로 통과 중이라, 구현 전에 새 기대값으로 바꾸면 실패해야 한다(전진 검사).
  3. `bunx tsc --noEmit` 통과. 회귀 방지 검사로 작업 전에도 통과한다(pre-state 통과).
  4. `grep -n "선택: " docs/07-ui-spec.md | grep -c "파일:"` ≥ 1. 작성 시점 pre-state 0, 전진 검사.
  5. 전체 `bunx vitest run`의 실패는 기준선 `pdf-preview` 1건뿐이다(회귀 방지).

## Work slices
- [ ] S1. 순수 함수 `selectionSummary(entries, selection)`(파일/폴더 수, 선택·전체 용량)를 만들고 단위 테스트로 규칙을 고정한다 — completion criterion: DoD 1(계산 부분)
- [ ] S2. `StatusBar`가 활성 탭의 항목·선택으로 새 형식을 그린다(크기 표기는 `크기 형식` 설정). 기존 테스트 3개를 새 형식으로 고친다 — completion criterion: DoD 1(표시 부분), 2 (depends: S1)
- [ ] S3. `docs/07-ui-spec.md`의 상태 줄 예시를 새 형식으로 고친다 — completion criterion: DoD 4 (depends: S2)
