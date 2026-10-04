<!-- forge-slug: windows-path-compat -->
<!-- task: 51 -->
<!-- tdd: on -->
<!-- priority: high -->
# Windows 경로(`\`, 드라이브 루트) 호환: 탭 제목·경로 표시줄·상위 폴더 이동

## Goal / Non-goals
- Goal: Windows에서 `C:\Program Files\Aside\Application` 같은 경로가 폴더 단위로 나뉘어 탭 제목에는 마지막 폴더명만, 경로 표시줄에는 `C:\` 뿐 아니라 각 폴더 링크가 나오고, 상위 폴더 이동(←, Backspace 등)이 드라이브 루트 직전까지 동작한다.
- 방식(결정됨): Rust와 저장된 `state.json`은 건드리지 않는다. UI/ts-client의 경로 도우미가 `\`와 `/`를 모두 구분자로 이해하고, `C:\`·`C:/` 형태의 드라이브 루트를 루트로 인식한다. 경로를 합칠 때는 그 경로가 쓰던 구분자를 따른다. macOS/Linux 동작은 그대로다.
- 범위(결정됨): UI 경로 처리 전부 + Windows에서 `cargo test --workspace`/vitest를 돌려 드러나는 **경로 관련** 실패까지. 그 밖의 Windows 실패(드래그, 휴지통, 볼륨 등)는 고치지 않고 목록만 남긴다.
- Non-goals: Rust 쪽 경로 정규화(`/`로 통일), UNC(`\server\share`) 완전 지원(깨지지만 않게), 설정 `shortcuts`의 `~`/`${user.*}` 확장 구조 변경, Windows 전용 신규 기능.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이미 찾은 지점: `packages/ts-client/src/backend.ts`의 `joinPath`/`parentPath`/`baseName`(이게 TabBar·ActionBar·FileTable·DragLayer·store 전반이 씀), `apps/desktop/src/ui/Breadcrumb.tsx`(`split("/")`, 루트 `"/"` 고정), `ui/TabBar.tsx`(`|| "/"`), `lib/multiRename.ts:90`, `ui/MultiRename.tsx:20`(`parentOf`), `state/store.ts`의 `transferDestError`(`replace(/\/+$/,"")`, `startsWith(t.path + "/")`), `gotoComplete`(`lastIndexOf("/")`, 끝에 `"/"` 덧붙임), 압축 풀기 폴백 `?? "/"`, `expandPath`의 `~/`.
- Definition of Done (실행 가능, 작성 시점 상태 기재):
  1. `cd apps/desktop && bunx tsc --noEmit` → 종료코드 0. (회귀 방지용: 지금도 통과함)
  2. `cd apps/desktop && npx vitest run src/__tests__ ../../packages/ts-client` → 새 Windows 경로 테스트 포함 전부 통과. (순방향 검사: 지금은 새 테스트가 없어 의미 없음 → TDD로 먼저 실패하게 작성. 단, 현재 이 PC에 Node가 없어 `bunx vitest`는 `File URL path must be an absolute path`로 실행 자체가 안 됨 → S0.)
  3. `parentPath("C:\a\b")==="C:\a"`, `parentPath("C:\a")==="C:\\"`, `parentPath("C:\\")===null`, `baseName("C:\a\b")==="b"`, `baseName("C:\\")===""`, `joinPath("C:\a","b")==="C:\a\b"`, `joinPath("C:\\","b")==="C:\b"`가 ts-client 테스트에 들어 있고 통과. 기존 `/` 경로 테스트도 그대로 통과.
  4. Breadcrumb 테스트: `C:\Program Files\Aside\Application` → 버튼이 `C:\`, `Program Files`, `Aside`, `Application` 4개이고 `Aside`를 누르면 `C:\Program Files\Aside`로 이동한다. 맨 앞 `/` 버튼은 없다.
  5. `cargo test --workspace`를 Windows에서 돌려 경로 관련 실패가 0건(알려진 소음 `coalesce_*` 등은 제외). 남은 실패는 run.md에 목록으로 기록.
  6. 실제 앱(`task dev`)에서 이미지의 상황(`C:\Program Files\Aside\Application`)을 열어 탭 제목이 `Application`이고 경로 표시줄이 폴더별로 나뉘며, ← 키로 `C:\`까지 올라간다. (UAT: 사람이 확인)

## Work slices
- [ ] S0. Windows에서 vitest가 돌게 환경 구성 — Node.js(LTS) 설치(winget `OpenJS.NodeJS.LTS`) 후 `npx vitest run` 사용. 완료 기준: 기존 `src/__tests__` 중 하나(예: `drag-drop.test.tsx`)가 Windows에서 실행되어 통과/실패가 정상 보고된다. 기존 알려진 실패(`pdf-preview`)는 소음으로 기록.
- [ ] S1. (TDD) ts-client 경로 도우미 — `parentPath`/`baseName`/`joinPath`가 `\`·`/`·드라이브 루트(`C:\`, `C:/`)를 이해. 완료 기준: DoD 3의 케이스가 먼저 실패하는 테스트로 작성된 뒤 통과, 기존 `/` 케이스 회귀 없음. (depends: S0)
- [ ] S2. (TDD) UI 사용처 — Breadcrumb(드라이브 루트 세그먼트, 구분자 표시), TabBar 제목 폴백(루트면 `C:\`), `multiRename`/`MultiRename.parentOf`, `transferDestError`, `gotoComplete`, 압축 풀기 폴백. 완료 기준: DoD 4 테스트 + 각 지점의 Windows 경로 단위 테스트 통과, `/` 경로 회귀 없음. (depends: S1)
- [ ] S3. Windows `cargo test --workspace` 실행 → 경로 관련 실패(구분자·아카이브 `x.zip!/`·드라이브 루트 등)만 고침, 나머지는 목록화. 완료 기준: DoD 5. (S1과 병렬 가능)
- [ ] S4. 실제 앱 확인 — DoD 6을 사람이 확인(UAT). 완료 기준: 탭 제목·경로 표시줄·상위 이동이 이미지 상황에서 정상. (depends: S2)
