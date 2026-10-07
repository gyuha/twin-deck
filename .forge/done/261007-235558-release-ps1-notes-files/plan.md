<!-- forge-slug: release-ps1-notes-files -->
<!-- task: 99 -->
<!-- tdd: off -->
<!-- priority: medium -->
# release.ps1이 변경 사항을 파일로 넘겨 Windows에서 깨지지 않게 한다 (리뷰 F)

## Goal / Non-goals
- Goal: `release.ps1`은 CHANGELOG 본문을 PowerShell 변수로 받아 `--notes` 인수로 넘긴다. Windows PowerShell 5.1은 인수 안의 큰따옴표를 이스케이프하지 않아 `"업데이트 확인"` 같은 문구에서 인수가 쪼개지고, 콘솔 코드페이지로 해석된 한글이 깨진다. `update-manifest.mjs`에 `--notes-file <경로>`를 더하고 `release.ps1`은 노트를 UTF-8 파일로만 주고받게 한다(변수·인수로 전달하지 않는다). `--notes`는 호환을 위해 남긴다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- release.sh 변경(bash는 영향 없음)
- Windows 실행 시험
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `release.ps1:63-66,88`, `update-manifest.mjs`(`parseArgs`가 두 개씩 짝지어 읽음), `update-manifest.test.mjs`. 이 환경에는 PowerShell이 없다 — node 쪽만 시험되고 ps1은 정적 검증이다. 한계를 run.md와 최종 보고에 적는다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. `bun test scripts/update-manifest.test.mjs`에 신규 테스트가 있고 통과한다: `--notes-file`이 가리키는 UTF-8 파일(한글·큰따옴표·줄바꿈·`--` 포함)의 내용이 `latest.json`의 `notes`에 그대로 들어간다. 구현 전에 실패(red)해야 한다.
  2. `grep -c -- '--notes $notesPlain' scripts/release.ps1` → 0 (착수 전 1), `release.ps1`이 `--notes-file`을 쓰고 노트 파일을 UTF-8(BOM 없음)로 쓴다(`grep -c 'notes-file' scripts/release.ps1` ≥ 1)
  3. `bun test scripts/` 전체 통과

## Work slices
- [ ] S1. 먼저 실패하는 테스트 — completion criterion: DoD 1 구현 전 실패
- [ ] S2. `update-manifest.mjs --notes-file`과 `release.ps1` 변경 — completion criterion: DoD 1~3 (depends: S1)
