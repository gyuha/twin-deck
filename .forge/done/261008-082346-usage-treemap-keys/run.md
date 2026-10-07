# RUN — treemap을 보이는 대로 방향키로 조작한다 (#29)

## 슬라이스 결과
- S1 `neighborTile`(겹치는 구간이 큰 이웃 선택, 가장자리 null)과 `treemap-layout.test.ts` 인접 케이스 5개 — ✅ as planned
- S2 `usageMove`·방향키 처리 교체·`Shift+→`(폴더 진입/파일 미리보기)·`Mod+Return`(`core.disk_usage.descend`) — ⚠ 화면 배치를 스토어가 알아야 해서 `UsageTreemap`이 `publishUsageTiles`로 알리는 모듈 변수를 추가(계획에 구체 방식 없었음)
- S3 `docs/05`·`docs/07` 갱신 — ✅ as planned

## 계획 대비 실제
- DoD 1~5 모두 충족. 기준선→이후: vitest 910 → 925(신규 15), tsc 0 → 0, Rust diff 0 → 0.
- 기존 `usage-treemap.test.tsx` 수정은 의도된 키 변경(→ 진입/← 상위/↑↓ 크기순 → 인접 이동, Shift+→ 진입)뿐이고 단언 약화는 없음. 계획서 DoD에는 `↑↓`도 바뀐다고 적혀 있었으나 loop.md C3 문구에는 `→`/`←`만 있어 문구가 좁았다(이슈 요구 "키보드의 방향대로"에 `↑↓`가 포함).
- `tdd: off`라 구현 전 red는 확인하지 않았다(계획서 DoD 2의 "구현 전에 실패해야 한다"는 검증 안 함).

## 학습
- 인접 판정은 "변이 가장 가까운 후보 중 맞닿는 길이가 가장 긴 것"으로 충분했다. 전체 배치가 사각형을 빈틈없이 채워서 가장자리 외에는 이웃이 항상 있다.
- `Shift+→`가 `core.preview`와 겹쳐 treemap에서는 `previewToggle`이 폴더면 진입하도록 분기했다(파일은 미리보기 유지, 사용자 확인).
- 실제 앱(WKWebView)과 `Mod+Enter`(mac `Cmd+Enter`)가 OS·웹뷰에서 가로채이지 않는지는 확인하지 못했다.
