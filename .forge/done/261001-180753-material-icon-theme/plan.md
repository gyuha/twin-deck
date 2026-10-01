<!-- forge-slug: material-icon-theme -->
<!-- task: 1 -->
<!-- tdd: on -->
# Material Icon Theme 파일 아이콘 적용

## 목표 / 비목표
- 목표: 파일 목록 행에 Material Icon Theme(5.38.1) 아이콘을 표시한다. 파일명, 확장자, 폴더명으로 아이콘을 정하고, 실패하면 기본 파일/폴더 아이콘을 쓴다. 심볼릭 링크는 일반 규칙을 따르되 링크 표시를 얹는다. 크기는 `behavior.table.icon_size` 설정을 따른다.
- 비목표:
  - 파일 목록 행 밖의 표시(브레드크럼, 즐겨찾기, 미리보기 헤더, 탭 제목)
  - 라이트/다크 변형(`*_light.svg`)과 앱 테마 연동
  - 폴더 열림 변형, `languageIds` 매핑, 루트 폴더 아이콘
  - 심볼릭 링크 대상 조회(`kind`만 사용)
  - 기존 선택(`●`)/폴더(`▸`) 기호 칸의 변경. 아이콘은 그 뒤에 별도 칸을 추가한다
  - npm `material-icon-theme` 의존성 추가. 에셋은 저장소에 복사해 버전을 고정한다

## 단일 진실 공급원
- 용어: `.forge/CONTEXT.md`의 "아이콘 테마", "아이콘 해석"
- 관련 ADR: 기존 `docs/adr/0009-license-and-provenance.md` (외부 에셋의 출처·라이선스 기록 원칙). 새 ADR은 만들지 않는다.
- 결정 사항(그릴링 합의):
  - 에셋: 업스트림 5.38.1의 SVG와 `dist/material-icons.json`을 새 패키지 `packages/material-icons`에 복사. `*_light.svg` 52개는 제외. LICENSE와 출처 버전을 같이 둔다.
  - 로딩: Vite `import.meta.glob("…/*.svg", { query: "?url", eager: true })`로 URL만 모아 `<img src>`로 그린다. SVG 본문은 JS 번들에 넣지 않는다.
  - 해석 순서: 파일명 전체(대소문자 무시) → 확장자(`a.test.ts`는 `test.ts` → `ts` 순) → 폴더명(`kind === "dir"`일 때만, 대소문자 무시) → 기본 아이콘. 심볼릭 링크는 폴더명 규칙을 쓰지 않고 파일 규칙으로 해석한 뒤 작은 화살표 오버레이를 CSS로 얹는다.
  - 표시 위치: `FileTable` 행의 `●`/`▸` 칸 뒤에 아이콘 칸 추가. 단일 컬럼(columns) 모드와 멀티 컬럼 모드 모두, 가상 탭 행 포함. 아이콘은 장식이므로 `aria-hidden`이다.
- 완료 정의(DoD): 아래 명령이 모두 통과하고, 기존 247개 테스트가 그대로 통과한다.
  1. `ls packages/material-icons/LICENSE packages/material-icons/icons/file.svg packages/material-icons/icons/folder.svg` → 성공 (사전 상태: 디렉터리 없음, 전진 확인)
  2. `ls packages/material-icons/icons | grep -c '_light\.svg$'` → `0`, `ls packages/material-icons/icons/*.svg | wc -l` → `1199` (1251 − 52, 5.38.1 기준)
  3. 매니페스트가 참조하는 모든 아이콘 파일이 존재: 해석 함수 테스트가 `fileNames`, `fileExtensions`, `folderNames`의 모든 값에 대해 `.svg` 파일 존재를 검증한다 (light 전용 항목은 제외 대상 목록과 함께 명시)
  4. `bun run --filter '*' typecheck` → 4개 패키지 모두 `Exited with code 0` (회귀 방지용이라 작업 전에도 통과하는 것이 정상)
  5. `cd apps/desktop && bunx vitest run` → 신규 테스트 포함 전부 통과 (사전 상태 247개 통과, 회귀 방지)
  6. 렌더 검증: `FileTable` 테스트가 `foo.ts`, `package.json`, `src/`(dir), `link`(symlink), 알 수 없는 확장자 `x.zzz`에 대해 각각 기대한 아이콘 URL을 가진 `<img>`를 확인한다 (문자열 존재가 아니라 실제 렌더된 `img[src]`로 확인)
  7. `grep -c 'material-icon-theme' THIRD_PARTY_NOTICES.md` → `≥1`, 같은 표에 MIT와 버전 `5.38.1`이 있다
  8. 사람 확인(UAT): 실제 앱(`bun run tauri dev` 또는 `bun run --filter @twin-deck/desktop dev`)에서 파일 목록에 형식별 아이콘이 보이고 선택·커서 표시가 깨지지 않는다 (시각 판단이라 자동화 불가)

## 작업 조각
- [ ] S1. `packages/material-icons` 패키지를 만든다. 5.38.1의 `_light`를 뺀 SVG, 필요한 섹션만 남긴 매니페스트(`iconDefinitions`, `fileNames`, `fileExtensions`, `folderNames`, `file`, `folder`), 업스트림 LICENSE, 출처 버전 문서를 복사하고 워크스페이스에 등록한다 — 완료 기준: DoD 1, 2가 통과하고 `bun install` 후 `@twin-deck/material-icons`가 desktop에서 import된다
- [ ] S2. 아이콘 해석 함수 `iconFor`를 테스트 먼저 작성하고 구현한다 (파일명 → 복합 확장자 → 폴더명 → 기본값, 대소문자 무시, 심볼릭 링크는 폴더명 규칙 제외) — 완료 기준: 해석 순서, 복합 확장자, 점으로 시작하는 파일(`.gitignore`), 대소문자, 확장자 없는 이름, 알 수 없는 확장자, symlink 각각의 단위 테스트와 DoD 3이 통과 (depends: S1)
- [ ] S3. 아이콘 URL 조회(`import.meta.glob ?url`)와 `FileIcon` 컴포넌트(크기는 `icon_size`, 링크 오버레이, `aria-hidden`)를 만든다 — 완료 기준: 컴포넌트 테스트가 올바른 `img[src]`와 symlink 오버레이를 확인 (depends: S2)
- [ ] S4. `FileTable` 행과 헤더 그리드에 아이콘 칸을 추가한다 (columns/멀티 컬럼 모드 모두, 가상 탭 행 포함) — 완료 기준: DoD 6, 기존 `virtual-list`, `columns-sort`, `virtual-tabs` 테스트를 포함한 DoD 5가 통과 (depends: S3)
- [ ] S5. `THIRD_PARTY_NOTICES.md`에 Material Icon Theme 5.38.1(MIT)을 기록하고, `docs/m2-status.md`의 "`icon_size`는 아이콘을 그리지 않는다" 문구를 현재 상태로 고친다 — 완료 기준: DoD 7이 통과하고 해당 문구가 더 이상 거짓이 아니다 (depends: S4)
- [ ] S6. 실제 앱에서 시각 확인(UAT)한다 — 완료 기준: DoD 8 (depends: S4)
