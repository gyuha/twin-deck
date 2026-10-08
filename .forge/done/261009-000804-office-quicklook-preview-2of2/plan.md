<!-- forge-slug: office-quicklook-preview-2of2 -->
<!-- task: 116 -->
<!-- part: 2/2 -->
<!-- tdd: on -->
# macOS에서 xlsx 계열을 Quick Look 미리보기의 시트 탭으로 보여 준다 (2/2)

## 목표 / 하지 않을 것
- 목표: macOS에서 디스크 위의 xlsx·xls·xlsm을 Quick Look 미리보기로 보여 준다. 시트가 여럿이면 앱이 그린 시트 탭을 클릭하거나 `Ctrl+Tab`/`Ctrl+Shift+Tab`으로 바꾼다. 1/2(`office-quicklook-preview-1of2`)의 Rust 실행기와 `QuickLookView`를 그대로 넓혀 쓴다.
  - **Rust**: 결과를 문서(`html`) 또는 시트 목록(`sheets: [{ name, html }]`)으로 돌려준다. QL 출력 구조(작성 시 실측)는 이렇다.
    - 시트가 여럿이면 `Preview.html`이 탭 껍데기다. `div.TabViewItem` 안의 `div.TabHeader`(시트 이름)와 `<a href="AttachmentN.html">`(시트 본문)이 탭마다 하나씩 있고, 탭 전환은 JS(`initTabViewsInPage`)가 한다. 이 JS는 쓰지 않는다(ADR-0014).
    - 시트가 하나면 탭 없이 `Preview.html` 자체가 시트다.
    - 형식은 확장자로 정하지 말고 출력 구조로 판단한다.
  - **UI**: 시트가 둘 이상일 때만 iframe 위에 시트 탭 줄을 그린다. 클릭하면 그 시트의 html로 `srcdoc`을 바꾼다. 시트 html 안의 첨부 참조(`spreadsheet.css` 등)도 1/2와 같은 방식으로 `fileUrl`로 바꾼다. 다른 항목으로 넘어가면 첫 시트로 돌아간다.
  - **표시 크기**: 시트는 줄이지 않고 원래 크기로 두며, 패널보다 넓으면 가로로 스크롤한다(docx·pptx의 너비 맞춤과 다르다).
  - **액션**: `core.preview.next_sheet`/`core.preview.prev_sheet`(scope `preview`)를 추가하고 `Ctrl+Tab`/`Ctrl+Shift+Tab`에 묶는다. 시트가 둘 이상일 때만 동작하고, pane의 `cycleTab`처럼 끝에서 처음으로 돌아간다.
  - `lib/office/kinds.ts`: Quick Look 대상에 xlsx·xls·xlsm을 더한다.
- 하지 않을 것:
  - QL이 시트마다 앞 4096행에서 안내 없이 자르는 것을 알리거나 우회하는 일(측정: 2만 행과 20만 행 모두 4096행으로 출력)
  - 시트 탭용 QL JS 실행
  - Windows·Linux 동작 변경, 압축 안 파일
  - 시트 탭 키를 설정 화면에 따로 노출하는 일(keybindings.toml로 바꾸는 기존 방식이면 충분하다)

## 기준 문서
- 용어: `.forge/CONTEXT.md`의 **Quick Look 미리보기**
- 관련 ADR: `docs/adr/0014-macos-office-quicklook-preview.md`
- 선행: `office-quicklook-preview-1of2`(순서상 권장. 강제 의존은 아니지만, 이 계획은 1/2의 실행기와 뷰를 넓히는 작업이다)
- 작성 시 확인
  - pane의 `core.tab.next`/`prev`가 `Ctrl+Tab`/`Ctrl+Shift+Tab`(`defaults.ts:271-272`)이고 `cycleTab`은 끝에서 처음으로 돌아간다.
  - 이 키를 쓰는 테스트는 `tab-switch.test.tsx`(pane, 미리보기 닫힘)다. 액션 목록을 세는 테스트가 있는지는 착수할 때 `grep -rn 'core.preview\.' apps/desktop/src/__tests__ packages`로 다시 센다(retro `copy-move-dialog-progress`의 교훈).
- 완료 정의(DoD). 기준선은 착수할 때 다시 잰다. 1/2이 끝난 뒤라 수치가 달라지므로, fg-run의 DoD 기준선을 따른다.
  1. `cargo test -p twin-deck-desktop quicklook_sheets`가 통과하고, 해당 테스트가 3건 이상이다. 테스트는 값으로 단언한다.
     - (a) 실측 구조를 본뜬 합성 2시트 QL 출력 fixture(탭 껍데기 + `Attachment2.html`·`Attachment5.html`)를 넣으면 `[{ name: "첫시트" }, { name: "둘째" }]`가 순서대로 나오고, 각 html에 그 시트의 셀 값이 들어 있다.
     - (b) 탭 없는 1시트 출력은 시트 하나가 된다.
     - (c) `cfg(target_os = "macos")`에서 저장소에 넣은 합성 2시트 xlsx fixture(내용은 합성 값만)를 실제 qlmanage로 돌리면 시트 이름 2개가 나온다.
     - 사전 상태: 목록 0건(앞으로 가는 확인). TDD로 (a)(b)가 먼저 red여야 한다.
  2. 새 `apps/desktop/src/__tests__/quicklook-sheets.test.tsx`(`renderApp(…, "mac")`)가 통과한다.
     - (a) 2시트 xlsx에서 탭 2개가 보이고, 탭을 클릭하면 srcdoc이 그 시트로 바뀐다.
     - (b) `Ctrl+Tab`/`Ctrl+Shift+Tab`이 시트를 바꾸고 끝에서 처음으로 돌아간다. 미리보기가 열린 동안에는 pane의 탭이 바뀌지 않는다.
     - (c) 1시트에서는 탭 줄이 없다.
     - (d) 시트 iframe에는 너비 맞춤 축소가 걸리지 않는다.
     - (e) xls·xlsm도 Quick Look으로 간다.
     - 사전 상태: 파일이 없어 실패한다(앞으로 가는 확인).
  3. 회귀 방지
     - `tsc` 통과
     - vitest에서 새 실패 0건(`tab-switch.test.tsx`, 1/2의 `quicklook-preview.test.tsx` 포함)
     - `cargo test -p twin-deck-desktop` 전부 통과
     - `cargo clippy -p twin-deck-desktop -- -D warnings` 통과
  4. 문서(사전 상태는 모두 0이며, 앞으로 가는 확인이다)
     - `grep -c 'core.preview.next_sheet' docs/05-actions-keybindings.md`가 1 이상이다(키와 scope를 표에 넣는다).
     - `grep 'VIEW-01' docs/01-feature-spec.md | grep -c '시트 탭'`이 1 이상이다.
  5. 실제 앱 확인(사람). WKWebView에서의 표시와 가로 스크롤은 jsdom이 대신할 수 없어 자동으로 확인할 수 없다. 격리 인스턴스에서 아래를 확인한다.
     - 여러 시트 xlsx를 Space로 열면 Finder처럼 셀 서식이 보인다.
     - 탭 클릭과 `Ctrl+Tab`으로 시트가 바뀐다.
     - 넓은 시트는 가로로 스크롤된다.
     - xls 한 개도 열린다.

## 작업 조각
- [ ] S1. Rust 시트 목록 추출(탭 껍데기 파싱과 1시트 처리)과 반환 타입 확장, `task gen-types` — 완료 기준: DoD 1이 green이다(먼저 red)
- [ ] S2. Backend 타입 반영과 `fake.ts`의 시트 응답 — 완료 기준: `tsc` 통과 (depends: S1)
- [ ] S3. 시트 탭 UI, 원래 크기 표시, `kinds.ts` 확장 — 완료 기준: DoD 2의 (a)(c)(d)(e)가 green이다 (depends: S2)
- [ ] S4. `core.preview.next_sheet`/`prev_sheet` 액션과 `Ctrl+Tab`/`Ctrl+Shift+Tab` 바인딩, `docs/05`·`docs/01` — 완료 기준: DoD 2 (b)와 DoD 4 (depends: S3)
- [ ] S5. 전체 회귀 확인과 실제 앱 확인 안내 — 완료 기준: DoD 3이 green이다. DoD 5의 확인 항목이 run.md에 적혀 있다 (depends: S4)
