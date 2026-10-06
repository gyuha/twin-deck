<!-- forge-slug: update-release-manifest -->
<!-- task: 76 -->
<!-- part: 3/3 -->
<!-- tdd: off -->
# 릴리스 스크립트가 업데이트 산출물과 latest.json을 올린다

## Goal / Non-goals
- Goal: 업데이트가 쓰는 `latest.json`을 릴리스에 올린다. OS마다 따로 빌드·업로드하므로 `scripts/update-manifest.mjs`가 이 OS의 항목(플랫폼 키, 다운로드 URL, `.sig` 내용)을 기존 `latest.json`에 병합한다. **한쪽 OS 파일이 빠져 있으면 그 OS의 항목은 만들지 않는다**(그 OS는 그 버전을 건너뛴다). `release.sh`(macOS)와 `release.ps1`(Windows)이 업데이트용 산출물(`.app.tar.gz`/NSIS 업데이트 파일 + `.sig`)과 `latest.json`을 초안 릴리스에 올리도록 고친다. 서명용 환경변수(`TAURI_SIGNING_PRIVATE_KEY` 또는 `_PATH`)가 없으면 안내하고 멈춘다. README의 배포 절차에 적는다.
- Non-goals: 실제 릴리스 실행·공개, 서명 키 생성·보관, Windows 빌드 실행(스크립트는 구문만), brew 지원, 버전 올리기.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: GitHub 이슈 #10
- Definition of Done:
  1. `bun test scripts/update-manifest.test.mjs` 통과, `test(` 6개 이상. 값으로 단언한다: (a) macOS arm64 항목만 있는 릴리스 → `platforms`에 `darwin-aarch64`만 있고 `windows-x86_64`는 없다, (b) 그 위에 Windows 항목을 병합 → 두 항목이 모두 있고 앞 항목은 그대로, (c) 같은 플랫폼을 다시 병합 → 교체(중복 없음), (d) 버전이 다른 기존 `latest.json`에 병합하면 거부(두 버전이 한 매니페스트에 섞이지 않게), (e) 서명 파일이 비어 있으면 거부, (f) 출력이 Tauri updater가 읽는 형식(`version`, `notes`, `pub_date`, `platforms.<키>.url|signature`).
  2. `bash -n scripts/release.sh` 종료 코드 0. `grep -c "update-manifest" scripts/release.sh scripts/release.ps1` 두 파일 모두 ≥ 1, `grep -c "latest.json" scripts/release.sh` ≥ 1, `grep -c "TAURI_SIGNING_PRIVATE_KEY" scripts/release.sh scripts/release.ps1` 두 파일 모두 ≥ 1.
  3. 스크립트 동작 검증: 가짜 산출물(임시 폴더의 `.tar.gz`·`.sig`)로 `update-manifest.mjs`를 직접 실행해 `latest.json`이 만들어지는 것을 테스트에서 확인한다. `release.sh`는 DRY_RUN=1로 돌려 `latest.json` 업로드 명령이 출력되는지 한 번 확인하되, **DRY_RUN 없이 실행하지 않는다**. 업데이트 산출물이 없어 DRY_RUN을 못 돌리면 그 사실과 이유를 run.md에 적는다.
  4. README에 `latest.json`·서명 키 안내가 들어갔다: `grep -c "latest.json" README.md` ≥ 1 (착수 전 값 기록).
  5. `cd apps/desktop && bunx tsc --noEmit`, `bunx vitest run --exclude '**/pdf-preview*'` 통과(회귀 방지).

## Work slices
- [ ] S1. `scripts/update-manifest.mjs` 병합 로직과 `scripts/update-manifest.test.mjs` — completion criterion: DoD 1, 3
- [ ] S2. `release.sh`: 서명 환경변수 검사, 업데이트 산출물 업로드, 매니페스트 병합·업로드(`--clobber`) — completion criterion: DoD 2, 3 (depends: S1)
- [ ] S3. (릴리스 빌드에서만 `--config '{"bundle":{"createUpdaterArtifacts":true}}'`로 업데이트 산출물을 켠다. 기본 `task bundle`은 키 없이 그대로 된다) `release.ps1`에 같은 흐름, `Taskfile.yml` 번들 단계가 업데이트 산출물을 만들도록 필요한 변경 — completion criterion: DoD 2 (depends: S1)
- [ ] S4. README 배포 절차 갱신 — completion criterion: DoD 4 (depends: S2)
