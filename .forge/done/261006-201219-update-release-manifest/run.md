# 실행 기록 — 릴리스 스크립트가 업데이트 산출물과 latest.json을 올린다

## 슬라이스 결과
- S1 `scripts/update-manifest.mjs`와 테스트 — ✅ `mergeManifest`(순수 함수) + CLI. `bun test` 8건.
- S2 `release.sh` — ✅ 업데이트 산출물(`.app.tar.gz`·`.sig`)을 공백 없는 이름으로 복사해 올리고, 올라온 `latest.json`을 받아 이 OS 항목을 병합해 `--clobber`로 올린다. 산출물이 없으면(DRY_RUN 제외) 서명 키 환경변수 안내와 함께 멈춘다.
- S3 `release.ps1`과 `Taskfile.yml` — ✅ ps1에 같은 흐름. Taskfile에 `bundle:release`(mac/win)를 추가해 릴리스 빌드에서만 `--config '{"bundle":{"createUpdaterArtifacts":true}}'`로 업데이트 산출물을 만든다. `release:draft`·`release`가 이를 쓰고 평소 `task bundle`은 키 없이 그대로다.
- S4 README — ✅ "앱 안 업데이트와 서명 키" 절 추가

## DoD baseline → after
1. `bun test scripts/update-manifest.test.mjs` — 파일 없음 → 8건 통과: 한 OS만 → 그 OS만, 병합 후 앞 항목 보존, 재병합 교체, 버전 불일치 거부, 서명 비어 있음 거부, 출력 형식, 필수값, CLI 두 번 호출 + 버전 불일치 종료 코드 1
2. `bash -n scripts/release.sh` 0. `grep -c "update-manifest"` sh 1·ps1 1, `latest.json` sh 6, `TAURI_SIGNING_PRIVATE_KEY` sh 3·ps1 3
3. `DRY_RUN=1 VERSION_OVERRIDE=9.9.9 bash scripts/release.sh draft` 실행: 가짜 산출물로 대신한다는 안내 뒤 `gh release create`와 `gh release upload …app.tar.gz …sig latest.json --clobber`가 출력됐고 GitHub는 바뀌지 않았다. 실제 릴리스 실행은 하지 않았다.
4. `grep -c "latest.json" README.md` 0 → 3
5. `tsc --noEmit` 0, vitest(pdf-preview 제외) 84파일 728건 통과

## 판단·발견
- ⚠ 한계: 실제 서명 키로 만든 산출물, GitHub 초안에서 받은 latest.json 병합, Windows 경로(`release.ps1`, `bundle:release:win`)는 실행해 보지 못했다. ps1은 구문 확인도 못 했다(macOS에서 PowerShell 없음). DRY_RUN은 `gh release download`가 실패하는(없는 태그) 경우만 탔다.
- Windows 설치 파일을 `twin-deck-<버전>-windows-x64-setup.exe`로 이름을 바꿔 올린다(원래는 "Twin Deck_<버전>_x64-setup.exe" — GitHub가 공백을 점으로 바꾸므로 latest.json의 URL과 어긋난다). 사용자가 보는 릴리스 파일명이 바뀐다. 공개 판정은 `*-setup.exe`라 영향 없다.
- 공개 키는 아직 자리표시(`REPLACE_WITH_UPDATER_PUBKEY`)다. 사용자가 키를 만들어 알려 주기 전에는 설치 서명 검증이 실패한다. 검사 C7이 이를 기다린다.
- 업데이트 엔드포인트가 `releases/latest/download/latest.json`이라 공개된 최신 릴리스만 본다. 초안은 보이지 않는다.
