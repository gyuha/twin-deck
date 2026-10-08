# 실행 기록 — macOS xlsx 계열 Quick Look 시트 탭 (2/2)

워크플로우 없이 한 세션에서 직접 처리했다(S1→S5 직렬 의존). TDD로 진행했다. 1/2(`office-quicklook-preview-1of2`)의 UAT에서 `srcdoc`이 실패했으므로, 이 계획에 적힌 `srcdoc`은 ADR-0014(기준 문서, Blob URL로 고쳐짐)대로 Blob URL로 읽어 실행했다(사용자 승인).

## 조각별 결과
- S1 Rust 시트 목록 추출(탭 껍데기 해석), 반환 타입 확장(`sheets: Vec<QuickLookSheetDto>`), gen-types — ⚠ DoD 1 (b)를 다르게 구현했다. 계획은 "탭 없는 1시트 출력은 시트 하나가 된다"였지만, 탭이 없으면 **시트 목록 없이 문서(`html`) 하나**로 온다. 출력 구조만으로는 1시트 xlsx와 docx를 가를 수 없기 때문이다. 축소하지 않는 판단은 프런트가 확장자(`quickLookKindOf` → `"sheet"`)로 한다. 출력 폴더 밖을 가리키는 탭 링크를 버리는 테스트를 더했다. 시트 이름의 HTML 엔티티(`&amp;` 등)를 푼다(실측: QL이 `둘째 &amp; 셋`으로 씀)
- S2 Backend 타입과 fake의 시트 응답 — ✅ (fake 기본값은 `sheets: []`, 시트는 `quickLookResponder`로 흉내 낸다)
- S3 시트 탭 UI, 원래 크기 표시, `kinds.ts` 확장 — ✅. 시트 상태는 매번 새로 만들어지는 `preview` 객체가 아니라 별도 store 필드 `previewSheet { path, index, count }`에 두었다. 탭 줄은 미리보기 본문 위에 붙어 있다(sticky)
- S4 `core.preview.next_sheet`/`prev_sheet` 액션과 `Ctrl+Tab`/`Ctrl+Shift+Tab`, docs/05·docs/01 — ✅. ⚠ 1/2이 "docx·pptx 계열만"이라고 쓴 곳을 Office 전체로 넓혔다(설정 설명과 그 테스트, `td-config` doc 주석, VIEW-01)
- S5 전체 회귀와 실제 앱 확인 안내 — ✅ DoD 3 green. 실제 앱 확인은 사람이 한다

## DoD (기준선 → 실행 후)
1. `cargo test -p twin-deck-desktop quicklook_sheets`: 0건 → 4건 통과(탭 껍데기 순서·엔티티, 탭 없으면 시트 목록 없음, 출력 폴더 밖 링크 버림, **실제 qlmanage로 저장소의 합성 2시트 xlsx** `fixtures/quicklook/two-sheets.xlsx`). 탭 관련 3건이 먼저 동작 수준에서 red였다(read_output을 시트 없이 분리한 상태)
2. `quicklook-sheets.test.tsx`: 파일 없음 → 7건 통과((a) 탭 2개와 클릭 전환·첨부 주소, (b) `Ctrl+Tab`/`Ctrl+Shift+Tab` 순환, 그동안 패널 탭 그대로, (c) 1시트는 탭 없음, (d) 시트는 축소하지 않음(`layout` 단위 테스트, 문서는 축소), (e) xls·xlsm도 QL, 돌아오면 첫 시트, 형식 판별). 먼저 7건 모두 red였다
3. 회귀 방지
   - tsc(desktop·ts-client): 통과 → 통과. 참고: `packages/actions`의 tsc는 HEAD에서도 실패한다(`actions.test.ts`의 `cursorIsArchive` 타입, 이번 변경과 무관하며 DoD 밖). 액션 테스트 19건은 통과
   - vitest: 1020건 → 1026건 통과, 실패 파일은 같은 2개(`model-formats`, `pdf-preview`), 새 실패 0건(`tab-switch`, `quicklook-preview` 포함)
   - cargo test desktop: 65건 → 69건(2회 연속 통과), clippy·fmt 통과
4. 문서: `core.preview.next_sheet` in docs/05 0 → 1, VIEW-01 "시트 탭" 0 → 1
5. 실제 앱 확인: 사람이 할 차례

## 계획에서 벗어난 것
- `srcdoc` → Blob URL(위 설명). 1/2 테스트 중 "macOS의 xlsx는 지금 동작 그대로"는 이번 변경으로 의도대로 바뀌어 지웠다. 형식 판별 테스트에서 xlsx 계열을 null 목록에서 뺐다.
- 시트 탭 버튼은 `tabIndex=-1`이다. 포커스가 버튼으로 가도 키는 window keydown이 처리하므로 미리보기 키가 그대로 동작한다.
- 실제 WebKit 확인(이번에도): QL이 만든 시트 HTML(`spreadsheet.css` 포함)을 Blob iframe에 축소 없이 띄워 스냅숏을 찍었다. `BackCompat`이고 셀 테두리가 있는 표로 보였다.

## 남은 위험
- QL은 시트마다 앞 4096행까지만 그리고 안내하지 않는다(VIEW-01에 적었다).
- 탭 껍데기 구조(`TabHeader` + `href`)는 qlmanage의 출력 형식이라 macOS가 바꾸면 시트 목록이 비고, 첫 시트 껍데기(JS 없이 빈 화면)가 보일 수 있다. 이것은 실제 qlmanage 테스트(`quicklook_sheets_real_qlmanage_two_sheet_xlsx`)가 잡는다.
