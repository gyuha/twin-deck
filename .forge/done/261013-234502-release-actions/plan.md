<!-- forge-slug: release-actions -->
<!-- task: 148 -->
<!-- tdd: off -->
# GitHub Actions로 macOS·Windows 빌드와 공개, 배포용 `task deploy`

## 목표 / 하지 않을 것
- 목표: `task deploy` 한 번으로 GitHub Actions가 macOS와 Windows를 각각 빌드해 같은 비공개 초안에 올리고, 사람이 승인하면 초안을 공개하고 Homebrew tap까지 갱신한다.
- 하지 않을 것:
  - 기존 로컬 `task release:draft` / `task release`는 지우거나 바꾸지 않는다(비상용으로 남긴다). `release.sh` / `release.ps1`도 Actions가 그대로 호출할 수 있으면 고치지 않는다.
  - Intel Mac(x86_64) 빌드는 하지 않는다. `macos-latest`는 arm64라 지금처럼 arm64만 만든다.
  - 코드 서명 인증서(Windows SmartScreen, macOS 공증)는 다루지 않는다. 빌드는 계속 서명되지 않는다.
  - 태그 푸시·버전 변경 push로 자동 시작하지 않는다. 시작은 수동 실행(`workflow_dispatch`)뿐이다.
  - 사용자가 올릴 Secret과 GitHub Environment 설정은 에이전트가 만들지 않는다(아래 "사용자가 할 일").

## 확정한 결정 (그릴링 5건)
1. Actions가 macOS·Windows를 모두 빌드하고 공개까지 맡는다.
2. 시작은 `workflow_dispatch`. `task deploy`가 사전 점검 뒤 `gh workflow run`으로 시작한다.
3. 공개 job에 GitHub Environment `release`(Required reviewers = 본인)를 붙여, 두 OS 업로드 뒤 승인해야 공개한다.
4. tap 갱신은 Actions가 한다. fine-grained PAT를 Secret `TAP_GITHUB_TOKEN`으로 쓴다(`gyuha/homebrew-tap` 한 저장소, Contents 읽기·쓰기).
5. 기존 `release:draft` / `release`는 유지하고 `deploy`를 새로 추가한다.

재확인(2026-10-13, 계획 다듬기에서 사용자가 다시 답함):
- 공개 직전 승인 단계(결정 3)는 유지한다. 승인 없이 자동 공개하는 안은 고르지 않았다.
- tap 갱신은 Actions에서 한다(결정 4 유지). 그래서 `TAP_GITHUB_TOKEN`도 등록해야 한다. 사용자가 처음 말한 Secret은 `TAURI_SIGNING_PRIVATE_KEY` 하나뿐이었으므로 이 토큰은 추가로 필요하다는 점을 안내한다.
- "배포용 Taskfile.yml"은 새 파일이 아니라 기존 `Taskfile.yml`에 `deploy` 작업을 추가하는 것으로 이해한다(저장소 루트에 이미 `Taskfile.yml`이 있다). 별도 파일을 원했다면 알려 달라고 핸드오프에 적는다.

실행 중 정한 기술 사항(사용자가 정하지 않은 것):
- 두 OS job이 같은 초안을 동시에 만들면 부딪히므로 순서대로 돈다: macOS → Windows → 공개.
- 공개 job은 Ubuntu에서 돈다. `release.sh`는 macOS 번들이 있어야 하므로 공개 단계에는 쓰지 못한다. 공개 전용 스크립트(`scripts/publish-draft.mjs`)를 새로 둔다.
- Environment `release`가 없으면 GitHub이 보호 없이 자동으로 만들어 승인 없이 공개돼 버린다. 그래서 `task deploy`가 `release` Environment에 승인자가 걸려 있는지 먼저 확인하고, 없으면 시작하지 않는다.

## 사용자가 할 일 (에이전트가 하지 않는다)
- Secrets: `TAURI_SIGNING_PRIVATE_KEY`(키 내용), 키에 비밀번호가 있으면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `TAP_GITHUB_TOKEN`.
- Settings → Environments → `release` 생성, Required reviewers에 본인 추가.
- 현재 확인한 상태: 저장소에 Environment가 하나도 없다(`gh api repos/gyuha/twin-deck/environments` 결과 없음).

## 근거 자료
- 용어: 없음 (`.forge/CONTEXT.md`에 릴리스 용어는 없고, 릴리스 설명은 `AGENTS.md`의 "릴리스 공개 흐름"에 있다).
- 관련 ADR: 없음.
- 현재 스크립트의 제약(코드로 확인함):
  - `release.sh` / `release.ps1`은 main 브랜치 + `origin/main`과 같은 커밋 + 깨끗한 작업 트리를 요구한다. `workflow_dispatch`를 main에서 시작하면 `actions/checkout`이 main 브랜치로 체크아웃해 통과한다.
  - `release-notes.mjs`는 이전 태그를 `git tag`로 찾으므로 체크아웃에 `fetch-depth: 0`이 필요하다.
  - `update-tap.mjs`는 `TAP_URL` 환경변수로 tap 주소를 받고(기본은 인증 없는 https), `gh api`로 릴리스를 읽는다. 토큰이 든 `TAP_URL`과 `GH_TOKEN`이 필요하다.
- 완료 정의(DoD): 아래 "작업 조각"의 각 기준이 모두 맞고, "검증" 절의 명령이 모두 통과한다.

## 작업 조각
- [ ] S1. `.github/workflows/release.yml` 추가 — 완료 기준: 아래 두 가지가 모두 맞다.
  - 트리거는 `workflow_dispatch`뿐이고(`on:` 아래 다른 키 없음), 같은 워크플로를 동시에 두 번 돌리지 않는다(`concurrency`, 취소 없이 대기).
  - 세 job이 `mac` → `windows` → `publish` 순서(`needs`)이고, `mac`은 `macos-latest`에서 `bun run --cwd apps/desktop tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":true}}'` 뒤 `scripts/release.sh draft`를, `windows`는 `windows-latest`에서 `--bundles nsis`로 빌드한 뒤 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Mode draft`를, `publish`는 `environment: release`를 달고 S2 스크립트를 호출한다. 빌드 job은 `fetch-depth: 0`, Rust 캐시, `bun install --frozen-lockfile`, 서명 키 Secret 환경변수, `GH_TOKEN`, `permissions: contents: write`를 갖는다. `publish`는 `TAP_URL`(토큰 포함)과 `GH_TOKEN`을 넘긴다.
- [ ] S2. `scripts/publish-draft.mjs`(+ `scripts/publish-draft.test.mjs`) 추가 — 완료 기준: 초안(`v<버전>`)이 (a) 있고 초안이며, (b) 대상 커밋이 현재 HEAD이고, (c) macOS·Windows 파일이 모두 있고, (d) `latest.json`이 `darwin-aarch64`와 `windows-x86_64` 항목을 모두 갖고 있을 때만 공개(`draft=false`)한 뒤 `scripts/update-tap.mjs <버전>`을 부른다. 하나라도 어긋나면 이유를 한글로 출력하고 공개하지 않은 채 0이 아닌 코드로 끝낸다. `DRY_RUN=1`이면 공개와 tap push를 출력만 한다. 단위 테스트는 위 (a)~(d) 판단 부분(순수 함수)을 검사한다. tap 갱신이 실패하면 `release.sh`와 같은 안내와 종료 코드 4를 쓴다.
- [ ] S3. `Taskfile.yml`에 `deploy` 작업 추가 — 완료 기준: `task --list`에 `deploy`가 보이고, 실행하면 확인 문구(prompt) 뒤에 이 순서로 점검한다. 하나라도 어긋나면 `gh workflow run` 전에 멈춘다: main 브랜치 / 작업 트리가 깨끗함 / `origin/main`과 같은 커밋 / `node scripts/release-notes.mjs --check` / 이 버전 릴리스가 이미 공개되지 않았음 / Environment `release`에 Required reviewers가 걸려 있음. 통과하면 `gh workflow run release.yml --ref main`을 실행하고 진행을 볼 방법(`gh run watch` 안내와 승인 요청이 온다는 점)을 출력한다. 기존 `release:draft` / `release` 작업은 그대로다.
- [ ] S4. 문서 갱신 — 완료 기준: `deploy.md`의 "배포 순서"와 "명령"에 `task deploy`(Actions) 경로가 평소 경로로, 로컬 `task release:draft`/`release`가 비상용으로 적히고, 필요한 Secret 3개와 Environment 설정 방법이 있다. `AGENTS.md`의 Commands 목록에 `task deploy`가 있고, "릴리스 공개 흐름"의 "에이전트는 사용자가 명시적으로 요청하기 전에는 … 실행하지 않는다" 문장에 `task deploy`(Actions 시작)도 포함된다.

## 검증 (작성 시점에 한 번씩 돌려 본 상태를 적는다)
- `task --list | grep -c deploy` → 1. 지금은 0(`deploy` 없음). 조각 S3을 하기 전이라 정상이다(앞으로 맞춰야 하는 확인).
- `bun -e 'const y=Bun.YAML.parse(await Bun.file(".github/workflows/release.yml").text()); console.log(Object.keys(y.on).join(), Object.keys(y.jobs).join())'` → `workflow_dispatch mac,windows,publish`. 지금은 파일이 없다. 이 명령이 돌아가는 건 확인했다(`Bun.YAML.parse` 함수 있음, bun 1.4.2).
- `bun test scripts/publish-draft.test.mjs` → 통과. 지금은 파일이 없다.
- `DRY_RUN=1 node scripts/publish-draft.mjs` → 공개·push는 출력만 하고 판단 결과를 보여 준다(실제 GitHub는 바꾸지 않는다). 지금은 파일이 없다.
- `bun test scripts/release-notes.test.mjs scripts/update-tap.test.mjs scripts/update-manifest.test.mjs` → 통과(기존 스크립트를 건드리지 않았다는 회귀 확인). 회귀 확인이라 지금도 통과한다(작성 시점에 30 pass / 0 fail).
- `grep -c "task deploy" deploy.md AGENTS.md` → 두 파일 모두 1 이상. 지금은 0이다.
- `grep -n "pull_request\|push:\|tags:" .github/workflows/release.yml` → 출력 없음(수동 실행 외 트리거가 없음). 부정 확인이라 위의 YAML 파싱 명령이 실제로 돌아가야 의미가 있다.
- 실제 Actions 동작(두 OS 빌드, 승인 대기, 공개, tap 갱신)은 이 계획으로 로컬에서 확인할 수 없다. 사용자가 Secret과 Environment를 준비한 뒤 첫 실행에서 확인한다. 이 한계를 실행 결과(run.md)에 그대로 적는다.
