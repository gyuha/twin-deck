<!-- forge-slug: preview-window-state-2of2 -->
<!-- task: 69 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# 미리보기 창 이동·크기 조절 (2/2): 제목 줄로 이동, 가장자리로 크기 조절, 더블클릭 초기화

## Goal / Non-goals
- Goal: 미리보기 창(`Preview.tsx`)을 마우스로 옮기고 크기를 바꾼다. **이동**: 제목 줄을 끌면 창이 그만큼 옮겨지고, 제목 줄 일부(최소 64px)는 항상 화면 안에 남는다. **크기**: 네 가장자리와 네 모서리를 끌어 크기를 바꾸고, 최소 크기(너비 320px, 높이 200px)보다 작아지지 않으며 화면보다 커지지 않는다. **기억**: 바꾼 위치·크기는 `previewRect` 상태에 담겨 닫았다 다시 열거나 다른 파일로 넘겨도 유지되고(1/2의 저장·복원으로 앱을 다시 켜도 이어진다), 창 크기가 줄어들어 화면 밖에 걸리면 다시 열 때 화면 안으로 보정한다. **초기화**: 제목 줄을 더블클릭하면 기본 크기·가운데로 돌아간다(`previewRect = null`). 값이 없으면 지금과 같은 기본 배치(높이 `80vh`, 너비 `44rem`, 가운데)다.
- Non-goals: 키보드로 이동·크기 조절, 미리보기 내용 레이아웃 변경(이미지·PDF·비디오는 지금처럼 창 크기를 따른다), 창 밖 배경 클릭 동작 변경, 새 설정 키·단축키.
- 선행: 1/2(저장 상태 `previewRect`)가 먼저 봉인돼 있어야 한다.
- 이슈 추적: GitHub 이슈 #11

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__ -t "미리보기 창 이동"` → 통과 ≥ 1, 실패 0. 제목 줄을 끌면 위치가 그만큼 바뀌는지, 화면 밖으로 완전히 나가지 않는지(제목 줄 64px 이상 남음), 끌기를 마치면 `previewRect`에 반영되는지를 단언한다. 작성 시점 pre-state: 0 tests. 전진 검사.
  2. `bunx vitest run src/__tests__ -t "미리보기 창 크기"` → 통과 ≥ 1, 실패 0. 오른쪽·아래·왼쪽·위 가장자리와 모서리를 끌 때 크기와(왼쪽·위는 위치도) 바뀌는지, 최소 크기 아래로 못 줄고 화면보다 못 커지는지를 단언한다. 전진 검사.
  3. `bunx vitest run src/__tests__ -t "미리보기 창 기억"` → 통과 ≥ 1, 실패 0. 닫았다 다시 열거나 다른 파일로 `↓`로 넘겨도 위치·크기가 유지되는지, 제목 줄 더블클릭이 기본값으로 되돌리는지, 화면 밖에 걸린 저장 값은 열 때 보정되는지를 단언한다. 전진 검사.
  4. 기존 미리보기 테스트(`preview`, `archive-preview`, `preview-folder-enter` 등)와 `tsc`, 전체 `bunx vitest run`(실패는 기준선 `pdf-preview` 1건뿐)이 통과한다. 미리보기 키(`←`, `Esc`, `↑↓`, `→`)와 스크롤 동작이 그대로임을 확인하는 회귀 방지 검사다.
  5. `grep -c "미리보기 창" docs/07-ui-spec.md` ≥ 1 이면서 이동·크기 조절·더블클릭 초기화가 적혀 있다. 작성 시점 pre-state는 확인 후 기록. 전진 검사.

## Work slices
- [x] S1. `Preview.tsx`: 창을 `previewRect`(없으면 기본 배치)로 배치하고, 제목 줄 끌기(이동)와 가장자리·모서리 끌기(크기), 화면 안 제한·최소 크기 제한을 구현한다 — completion criterion: DoD 1, 2
- [x] S2. 닫고 다시 열기·파일 넘기기에서의 유지, 화면 밖 값 보정, 제목 줄 더블클릭 초기화 — completion criterion: DoD 3 (depends: S1)
- [x] S3. `docs/07-ui-spec.md`에 미리보기 창 이동·크기 조절을 적는다 — completion criterion: DoD 5 (depends: S1)
