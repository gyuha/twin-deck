# 실행 기록 — release-actions

## 슬라이스 결과
- S1 `.github/workflows/release.yml`(workflow_dispatch, mac→windows→publish, publish에 environment: release) — ✅ 계획대로
- S2 `scripts/publish-draft.mjs` + 단위 테스트 7건(순수 함수 `publishProblems`) — ✅ 계획대로
- S3 `Taskfile.yml`의 `deploy`(점검 6단계 뒤 `gh workflow run release.yml --ref main`) — ⚠ 실제 실행은 못 함(아래)
- S4 `deploy.md`·`AGENTS.md` 갱신 — ✅ 계획대로

## DoD baseline → after
- `task --list | grep -c deploy` 0 → 1
- 워크플로 YAML 파싱 파일 없음 → `workflow_dispatch mac,windows,publish`
- `bun test scripts/publish-draft.test.mjs` 파일 없음 → 7 pass
- `DRY_RUN=1 node scripts/publish-draft.mjs` 파일 없음 → 실제 저장소(v0.6.5 공개됨)를 읽기만 해서 "이미 공개된 릴리스" 이유로 종료 코드 1
- 회귀 테스트 3종 30 pass → 30 pass (기존 스크립트 미변경)
- `grep -c "task deploy"` 0/0 → deploy.md 4, AGENTS.md 2
- 수동 외 트리거 grep → 출력 없음 (회귀 가드, 기준선부터 해당 없음)

## 계획과 다른 점 · 한계
- `task deploy --yes`를 실행해 점검 단계를 확인하려 했으나 권한 분류기가 막았다(통과하면 Actions 시작까지 가는 명령). `task --dry`로 스크립트 전개만 확인했다. 점검 6단계의 동작은 미검증이다.
- 실제 Actions 동작(두 OS 빌드, 승인 대기, 공개, tap push)은 로컬에서 확인할 수 없다. 사용자가 Secret 3개와 Environment `release`를 만든 뒤 첫 실행에서 확인한다.
- 점검의 Environment 확인은 `gh api .../environments/release`의 `protection_rules`를 읽는다. 이 호출은 저장소 관리자 권한이 필요하고, 실패하면 "승인자 없음"으로 보고 멈춘다(안전한 쪽).
- 추측 사항: `release.sh`는 `git branch --show-current`가 main이어야 한다. `actions/checkout`이 main에서 dispatch하면 브랜치로 체크아웃하는 것으로 알고 있으나 실제로 확인하지 못했다.
