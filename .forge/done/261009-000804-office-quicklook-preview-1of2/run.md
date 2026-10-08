# 실행 기록 — macOS docx·pptx 계열 Quick Look 미리보기 (1/2) · 재실행

워크플로우 없이 한 세션에서 직접 처리했다. S1→S5가 모두 직렬 의존이라서다. TDD로 진행했다.
첫 실행은 UAT에서 `verified: failed`였다. pptx가 회색으로만 보였다. 원인을 WKWebView에서 실측해 고치고 다시 실행했다. 이 기록은 재실행 기준이며, 첫 실행에서 무엇이 틀렸는지는 아래 "UAT 실패와 수정"에 남긴다.

## 조각별 결과
- S1 Rust QL 실행기(`quicklook.rs`), `Service::quicklook_preview`, 명령, gen-types — ⚠ 계획에 없던 요청 순번(`seq: f64`)을 명령 인자에 더했다(UAT 중 사용자가 "연속으로 pptx를 열면 '취소되었습니다'가 자주 나온다"고 보고). 테스트 8건(계획 5건 이상)
- S2 Backend `quickLookPreview(path, seq)` — ✅. fake는 호출 경로와 순번을 기록한다
- S3 `QuickLookView`, `Preview.tsx` 연결, `quickLookKindOf`, `previewScroll` — ⚠ 계획의 `srcdoc`과 "iframe 안 키·링크를 앱이 다룸"을 버렸다. 대신 Blob URL을 쓰고, iframe은 입력을 받지 않게 하고 문서 크기로 늘려 본문이 스크롤한다(사용자 결정: "통째 표시, 선택 불가"). 테스트 11건
- S4 설정 설명, docs/01 VIEW-01, docs/05 page_up — ✅. ⚠ `td-config`의 `office` doc 주석도 고쳤다(bindings로 생성됨). VIEW-01에 "문서 안 글자는 선택할 수 없음"을 더했다
- S5 전체 회귀 — ✅. 실제 앱 확인은 사람이 다시 한다

## DoD (기준선 → 실행 후)
1. `cargo test -p twin-deck-desktop quicklook`: 0건 → 8건 통과(없는 경로, 시간 초과 kill, 새 요청이 이전 요청 취소, **늦게 들어온 오래된 요청은 새 요청을 끊지 않음**, 종료 코드 0인데 Preview.html 없음, html·첨부 폴더, 이전 결과 폴더 삭제, 실제 qlmanage로 textutil docx·doc)
2. `quicklook-preview.test.tsx`: 파일 없음 → 11건 통과. 바뀐 항목: (a) `srcdoc`이 아니라 Blob URL인지 확인, (g) PageDown이 미리보기 본문을 스크롤, (h) iframe이 `pointer-events: none`·`tabIndex=-1`이고 닫으면 Blob URL 해제, 요청 순번 증가
3. 회귀 방지
   - tsc(desktop·ts-client): 통과 → 통과
   - vitest: 1009건 통과·실패 파일 2개 → 1020건 통과, 실패 파일은 같은 2개(`model-formats`, `pdf-preview`), 새 실패 0건
   - cargo test desktop: 57건 → 65건(전체 3회 연속 통과)
   - clippy(`twin-deck-desktop`·`td-vfs`·`td-config`)와 fmt: 통과
4. 문서: ADR-0014 grep 0 → 1, page_up Quick Look 0 → 1, 설정 설명 단언 red → green
5. 실제 앱 확인: 첫 실행은 **실패**(pptx 회색). 재실행 뒤 다시 확인할 차례

## UAT 실패와 수정 (첫 실행 → 재실행)
- **원인 1 (pptx 회색)**: HTML 표준상 `srcdoc` 문서는 doctype이 없어도 늘 표준(no-quirks) 모드다. QL HTML의 단위 없는 길이(`width: 720`, `top:36`)가 무시되어, 절대 배치로만 된 pptx 슬라이드의 크기가 0이 되고 바탕 `#ACB2BB`만 남았다. docx는 글이 흘러서 보였지만 글꼴 크기와 여백도 원본과 달랐을 것이다. 계획과 ADR의 "iframe이면 quirks 모드"는 srcdoc에서는 거짓이었다.
- **원인 2 (확인하지 못한 가정 ①)**: 스크립트를 끈 sandbox 문서에서는 부모가 붙인 리스너도 WebKit이 실행하지 않는다. 그래서 "문서를 클릭한 뒤 Esc"와 "링크 막기"는 실제 앱에서 동작하지 않았을 것이다. jsdom 테스트가 통과한 것은 jsdom이 이 제약을 흉내 내지 않아서다.
- **실측 방법**: `swift`로 오프스크린 WKWebView를 띄워 확인했다. srcdoc은 `CSS1Compat`, width 284(무시), 리스너 0회. Blob URL은 `BackCompat`, width 720(적용), 리스너 0회. 같은 방식으로 Blob iframe + 배치 코드를 500px 창에 띄워 스냅숏을 찍었다. pptx는 0.640배, docx는 0.778배로 Finder처럼 보였다.
- **원인 3 ("취소되었습니다")**: Rust가 최근 요청을 qlmanage를 띄운 뒤의 등록 순서로 판단했다. Tauri async 명령은 스레드 풀에서 돌아 보낸 순서와 다르게 등록될 수 있다. 개발 모드의 StrictMode가 같은 파일을 두 번 요청하므로, 늦게 등록된 이전 요청이 지금 요청의 qlmanage를 죽였다. 이제 프런트 순번(`performance.timeOrigin + now()` 기반이고 창 안에서 늘 증가)으로 판단한다. 순번이 작은 요청은 qlmanage를 띄우지 않는다.
- **배치 보정**: 넘친 내용의 오른쪽 margin은 `scrollWidth`에 들어가지 않아 pptx 오른쪽 그림자가 잘렸다. 본문 왼쪽 여백만큼 오른쪽에도 자리를 둔다(스냅숏으로 확인).
- **테스트 안정화**: `quicklook_timeout_kills_the_child`가 병렬 실행에서 한 번 실패했다. 300ms 제한이 스크립트가 pid를 쓰기 전에 끝났다. 2초로 늘렸다(동작 결함 아님).
- ADR-0014를 실측에 맞게 고쳤다(Blob URL, 입력 받지 않는 iframe, 요청 순번, 검토한 대안에 srcdoc과 입력 가능한 iframe 추가).

## 그 밖에 계획에서 벗어난 것
- `tempfile`을 desktop의 일반 dependency로 옮겼다(Cargo.lock 변화 없음). `td_vfs::nfd_path`를 공개했다. `QuickLookDto` 타입을 ts-client index에서 내보냈다.
- Preview는 QL 문서일 때 `QuickLookView`를 `p.status`와 관계없이 바로 띄운다. 텍스트·이미지·기타 분기, 복사·편집, 일반 "불러오는 중…"에는 `!ql`을 더했다.
- 새 TDD 테스트 중 순번 경쟁 테스트(Rust)는 시그니처 변경과 함께 써서, red가 동작 실패가 아니라 컴파일 실패였다.
- **2/2 계획(백로그)은 `srcdoc`을 전제로 적혀 있다**("srcdoc을 바꾼다", DoD 2의 srcdoc 단언). 실행 전에 fg-ask로 Blob URL에 맞게 다듬어야 한다.

## forge 상태 처리 실수
- 승격 때 `git mv -k`가 추적되지 않는 백로그 파일을 오류 없이 건너뛰어, 첫 실행 내내 계획이 `.forge/backlog/`에 남아 있었다. 첫 run.md를 쓴 뒤에 발견해 `mv`로 옮겼다(내용은 바뀌지 않았다). 다음에는 승격 직후 `ls .forge/plan.md`로 확인한다.

## 남은 위험 (직접 검토)
- 문서 쪽 스크립트·폼·팝업은 sandbox가 막는다. iframe이 입력을 받지 않아 링크 이동도 없다.
- QL HTML에 원격 `<img>`나 meta refresh가 있으면 iframe이 불러올 수 있다(스크립트는 막힘). QL은 `AllowNetworkAccess: false`로 만들어서 그런 참조를 넣지 않을 것으로 본다(추정).
- 마지막 결과의 임시 폴더는 다음 QL 요청까지 남고, 앱이 끝날 때 소멸자가 돌지 않으면 `$TMPDIR`에 남는다.
- 첨부 그림(asset URL)이 Blob iframe 안에서 보이는지는 아직 실제 앱에서 보지 못했다(이번 스냅숏 문서에는 그림이 없었다).
