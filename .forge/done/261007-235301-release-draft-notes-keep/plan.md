<!-- forge-slug: release-draft-notes-keep -->
<!-- task: 98 -->
<!-- tdd: off -->
<!-- priority: medium -->
# 릴리스 스크립트가 이미 있는 초안의 본문을 덮어쓰지 않게 한다 (리뷰 L)

## Goal / Non-goals
- Goal: `release.sh`·`release.ps1`은 다른 OS가 먼저 만든 초안이 있으면 `gh release edit --notes-file`로 본문을 매번 덮어써서, 사용자가 GitHub에서 고친 노트가 사라진다. 초안이 이미 있으면 본문을 바꾸지 않는다(처음 만들 때만 CHANGELOG 항목으로 채운다). `latest.json`의 `notes`는 이전처럼 CHANGELOG에서 만든다. AGENTS.md의 "릴리스 공개 흐름" 설명도 맞춘다.
- 요청 경위: v0.5.1 이후 미출시 변경 전체 적대적 리뷰의 발견을 사용자가 "전체를 묶어 fg-loop로 무인 처리"로 지시했다.
- Non-goals:
- `gh` 실제 호출 시험
- 릴리스 절차 변경 외의 것
- 같은 리뷰의 다른 발견, CSP 변경, 이슈 #22 공개 댓글 정정은 이 작업 밖이다.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(리뷰 발견)
- 사전 확인(작성 시점): `release.sh:97`, `release.ps1:77`. 이 환경에서는 `gh`로 GitHub를 바꾸는 실행을 할 수 없어(안전) 검증은 정적이다 — 한계를 run.md에 적는다.
- Definition of Done (착수 전 기준선: vitest(pdf-preview 제외) 820건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음, `tsc` 0):
  1. `bash -n scripts/release.sh` 통과, `grep -c 'gh release edit' scripts/release.sh scripts/release.ps1`가 모두 0 (착수 전 각 1)
  2. `grep -n 'release edit' AGENTS.md`에서 "다른 OS가 먼저 만든 초안이면 본문을 같은 내용으로 맞춘다"가 "본문은 건드리지 않는다"로 바뀌어 있다
  3. `bun test scripts/` 통과(기존 스크립트 테스트가 깨지지 않는다)

## Work slices
- [ ] S1. 두 스크립트와 AGENTS.md에서 초안 본문 덮어쓰기를 없앤다 — completion criterion: DoD 1~3 (정적 검증 한계를 run.md에 적는다)
