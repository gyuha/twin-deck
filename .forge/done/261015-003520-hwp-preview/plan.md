<!-- forge-slug: hwp-preview -->
<!-- task: 162 -->
<!-- tdd: off -->
# HWP·HWPX 쪽 미리보기 (`@rhwp/core`)

## 목표 / 하지 않을 것
- 목표: 디스크 위 `.hwp`·`.hwpx`를 `@rhwp/core`(Rust+WASM, MIT)로 실제 조판대로 한 번에 한 쪽씩 SVG로 그려 미리보기에 보여 준다. 쪽은 EPUB 챕터·시트와 같은 `previewSheet` 상태와 `Ctrl+Tab`/`Ctrl+Shift+Tab`으로 넘긴다.
- 하지 않을 것:
  - 처음 요청의 `ohah/hwpjs`는 쓰지 않는다. 사용자가 `edwardkim/rhwp`의 `@rhwp/core`로 바꿨다. hwpjs는 npm이 rc.10이고, `main`은 Zig 텍스트 전용이라 맞지 않았다.
  - 설정 키(`preview.hwp`)를 만들지 않는다. 항상 켠다. 그래서 td-config·default.toml·gen-types·Settings 작업이 없다.
  - Rust 코어와 브리지 체인(Tauri 명령 → bindings → backend.ts → tauri.ts → fake.ts)을 건드리지 않는다. 파일은 `backend.fileUrl`로 읽는다.
  - 편집·저장·`@rhwp/editor`는 쓰지 않는다. 보기 전용이다.
  - 압축 안(`x.zip!/…`) 파일은 읽지 않는다. EPUB처럼 "미리 볼 수 없는 형식"으로 둔다.
  - 한컴 전용 글꼴을 번들하지 않는다. 시스템 글꼴과 rhwp의 자동 폴백을 쓰므로 줄바꿈이 원본과 다를 수 있다.
  - 새 키 바인딩이 없다. `core.preview.next_sheet`를 재사용한다.
  - `CHANGELOG.md`는 이 계획에서 쓰지 않는다. 버전을 올리는 배포 때 쓴다.
  - 작업 트리의 `apps/desktop/src/ui/Dialog.tsx` 변경은 이 작업과 무관하다. 건드리지 않고 같이 커밋하지도 않는다.

## 기준 문서
- 용어집: `.forge/CONTEXT.md`의 "HWP 쪽 미리보기"(이번에 추가), "데이터 미리보기"
- 관련 ADR: 없음. 라이브러리 선택은 되돌리기 쉬운 npm 의존성이라 ADR 조건을 채우지 않는다.
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx vitest run src/__tests__/hwp-preview.test.tsx`가 통과한다. 이 테스트는 `@rhwp/core`를 가짜로 바꿔 끼워 (a) `.hwp`와 `.hwpx`가 `HwpView`로 그려지고, (b) 쪽이 2개 이상이면 `Ctrl+Tab`으로 다음 쪽이 나오고, (c) 20MB 초과와 오류(깨진 파일)가 안내 문구로 보이고, (d) 압축 안 경로는 "미리 볼 수 없는 형식"인지를 확인한다. 작성 시점 상태: 파일이 없어 실패한다. 정상적인 앞방향 검사다.
  2. `grep -c '"@rhwp/core"' apps/desktop/package.json` → 1. 작성 시점은 0이다. 앞방향 검사다.
  3. `cd apps/desktop && bunx tsc --noEmit`가 종료 코드 0이다. 작성 시점에도 통과한다. 이유는 이번 변경이 깨뜨리지 않았는지 보는 회귀 방어선이기 때문이다.
  4. `cd apps/desktop && bunx vitest run` 전체가 통과한다. 회귀 방어선이다.
  5. 문서 5곳이 HWP를 언급한다. `grep -l -i 'hwp' README.md README.en.md docs/01-feature-spec.md docs/05-actions-keybindings.md docs/07-ui-spec.md | wc -l` → 5. 작성 시점은 0이다. README 한 쌍은 같은 커밋에서 맞춘다.
  6. 실제 앱 확인(자동 검사 불가, 사람 눈으로 본다): 격리 인스턴스(`HOME=/tmp/td-iso`, `TWIN_DECK_MULTI=1`)에서 `.hwp` 파일을 Space로 열었을 때 한 쪽이 보이고 `Ctrl+Tab`으로 다음 쪽이 나오며 첫 로드 뒤 지연이 견딜 만한지 확인한다. 단위 테스트는 wasm을 가짜로 바꾸므로 WKWebView에서 wasm이 도는지는 이 항목만 증명한다. 이 항목이 막히면 S1로 돌아가 계획을 다시 논의한다.

## 작업 쪼개기
- [ ] S1. `@rhwp/core` 의존성(`bun add`)을 넣고, `lib/hwp/`에 지연 로더를 만든다. 첫 호출 때 `globalThis.measureTextWidth`(Canvas 글자 폭 측정)를 등록한 뒤 `init`으로 wasm(`rhwp_bg.wasm`)을 불러온다. `readHwp(buffer)`는 `{ pageCount, renderPage(i) → svg 문자열 }`을 돌려준다. — 완료 기준: DoD 2, 그리고 로더 단위 테스트(가짜 `@rhwp/core`)가 통과한다. Vite가 wasm을 자산으로 내보내 `new URL(..., import.meta.url)`로 가리키는지 `bun run build`로 확인한다.
- [ ] S2. `ui/HwpView.tsx`를 만든다. `OfficeView`와 같은 구조(`backend.fileUrl` fetch → 20MB 한도 → loading/error/ready)에 쪽 렌더링을 얹는다. SVG는 `Blob` URL을 `<img>`에 넣어 문서 안 스크립트가 실행되지 않게 하고, `previewSheetsLoaded(path, pageCount)`로 쪽 수를 알린 뒤 `previewSheet.index`의 쪽만 그린다. 쪽을 바꾸면 이전 Blob URL을 해제한다. 문구는 i18n에 한글로 넣는다. 읽기 전용이라 복사 버튼과 편집은 없다. — 완료 기준: DoD 1의 (a)(b)(c) (depends: S1)
- [ ] S3. `ui/Preview.tsx`에 연결한다. `/\.hwpx?$/i`이고 디스크 위 파일일 때만(`!isArchivePath`, 3D·네이티브 미리보기와 겹치지 않게) `HwpView`를 띄우고, "미리 볼 수 없는 형식" 분기(`d?.kind === "other"`)에서 제외한다. 압축 안은 기존 분기를 그대로 탄다. — 완료 기준: DoD 1의 (d), DoD 4 (depends: S2)
- [ ] S4. 문서를 맞춘다: `README.md`와 `README.en.md`의 미리보기 표에 HWP 행(같은 커밋), `docs/01-feature-spec.md` VIEW-01, `docs/05-actions-keybindings.md`의 `core.preview.next_sheet` 설명(HWP 쪽 포함), `docs/07-ui-spec.md`에 "HWP 미리보기" 항목을 쓴다. — 완료 기준: DoD 5 (depends: S3)
- [ ] S5. 실제 앱에서 확인한다: wasm 로드·글자 폭 측정 콜백·쪽 넘기기·첫 로드 지연. 확인한 것과 못 한 것을 있는 그대로 기록한다. — 완료 기준: DoD 6 (depends: S3)
