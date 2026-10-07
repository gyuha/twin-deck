<!-- forge-slug: office-preview -->
<!-- task: 83 -->
<!-- tdd: off -->
# docx·xlsx·pptx 첫 부분 미리보기

## 목표 / 하지 않을 것
- 목표: 미리보기(Space)에서 디스크 위의 `.docx`·`.xlsx`·`.pptx`를 첫 부분만 빠르게 보여 준다. 3D 모델 미리보기와 같은 구조(확장자 판별 → `backend.fileUrl`로 읽기 → 프런트엔드 라이브러리, 라이브러리는 지연 로드)로 만들고 Rust는 건드리지 않는다.
  - docx: mammoth로 HTML 변환 후 앞 100개 블록(문단·표·목록 항목)만 표시
  - xlsx: SheetJS로 첫 시트의 앞 100행만 표시 (`sheetRows`, 서식이 적용된 표시값)
  - pptx: JSZip + `DOMParser`로 `slide1.xml`의 텍스트를 읽는 순서대로 문단으로 표시 (이미지·도형 위치는 무시)
  - 일부만 보여 줄 때는 하단에 "첫 부분만 표시합니다" 안내를 붙인다
  - 세 형식 모두 하단에 항상 "데이터 미리보기이며 실제 문서 화면과 다릅니다" 안내를 표시한다(잘렸는지와 무관)
  - 파일이 20MB를 넘으면 "너무 커서 미리 볼 수 없습니다 (크기)"를 보여 준다
- 하지 않을 것: 압축 파일 안의 항목(`foo.zip!/x.docx`) 지원 · `.doc`·`.xls`·`.ppt`·OpenDocument(`.odt`·`.ods`·`.odp`) · "더 보기"로 전체 로드 · pptx 이미지/도형 위치 재현 · 한도(행·블록·크기)를 설정 키로 노출 · Rust 서비스/명령/바인딩 변경

## 기준 문서
- 용어: `.forge/CONTEXT.md`에 해당 용어 없음 (새 용어를 만들지 않았다)
- 관련 ADR: 없음 (되돌리기 어려운 결정이 없다)
- 갱신할 문서: `docs/01-feature-spec.md`의 VIEW-01 행 (3D 모델 문장 뒤에 Office 문서 문장 추가)
- 완료 정의(DoD):
  1. `cd apps/desktop && bunx tsc --noEmit` 통과 (사전 상태: 통과)
  2. `cd apps/desktop && bunx vitest run` 의 실패 목록이 작업 전과 같다 — 작업 전 실패 3건: `audio-preview`(Blob URL), `preview-scroll`(PDF 마지막 쪽), `theme`(spaceui 토큰) → 새 실패 0건. 이미 실패하는 3건은 이번 변경과 무관한 기준선이다.
  3. 새 테스트 `office-formats.test.ts`·`office-preview.test.tsx`가 통과한다 (사전 상태: 파일이 없어 실패 — 앞으로 가는 확인)
  4. 20MB 초과 파일은 파싱 없이 "너무 커서" 안내가 나온다 (테스트로 확인)
  4b. 세 형식 모두 본문이 보일 때 "실제 문서 화면과 다릅니다" 안내가 하단에 나온다 (테스트로 확인, 사전 상태: 컴포넌트가 없어 실패 — 앞으로 가는 확인)
  5. `grep -n "docx" docs/01-feature-spec.md` 가 VIEW-01 행에서 1건 이상 나온다 (사전 상태: 0건 — 앞으로 가는 확인)
  6. `git diff --stat -- crates apps/desktop/src-tauri packages/ts-client` 가 비어 있다 (Rust·바인딩 무변경 보증, 회귀 방지 확인)
  7. 실제 앱 확인(vitest가 못 보는 부분): 격리 인스턴스에서 docx·xlsx·pptx 각 1개를 Space로 열어 내용이 보이는지 사람이 본다 — jsdom은 WKWebView 렌더링을 대신하지 못한다.
- 속도 확인: 실제 큰 docx·xlsx로 미리보기가 눈에 띄게 늦지 않은지 구현 중 측정한다. 아주 큰 docx에서 mammoth 전체 변환이 느리면 한도 조정을 retro에서 다룬다.

## 작업 조각
- [ ] S1. 형식 판별 `lib/office/kinds.ts` — `officeKindOf(name)`이 `docx`·`xlsx`·`pptx`(대소문자 무시)만 돌려주고 나머지는 null. 라이브러리를 불러오지 않는 가벼운 함수. — 완료 기준: `office-formats.test.ts`가 확장자별 판별, 대문자, 경로 구분자, 점 없는 이름, `.doc`·`.xls`·`.ppt`는 null임을 확인한다
- [ ] S2. 의존성 추가 — `mammoth`, `jszip`(pptx용), SheetJS(`xlsx`를 `https://cdn.sheetjs.com/...tgz`로 설치, 설치할 때 URL과 락파일 무결성 해시 확인). — 완료 기준: `bun install` 후 `bun.lock`에 세 패키지가 있고 `tsc --noEmit`가 통과한다
- [ ] S3. 형식별 읽기 모듈 `lib/office/` (지연 `import()`로 불러오며 한도는 상수) — docx(앞 100블록), xlsx(첫 시트 앞 100행), pptx(slide1 텍스트). 파일 20MB 초과면 읽지 않고 "너무 큼" 결과를 돌려준다. (depends: S1, S2) — 완료 기준: 작은 합성 docx·xlsx·pptx 샘플에 대한 단위 테스트가 앞 N개 자르기, 첫 시트/첫 슬라이드 선택, 한도 초과 처리를 확인한다
- [ ] S4. `ui/OfficeView.tsx` + `Preview.tsx` 연결 — `officeKindOf`가 맞으면 서비스의 `kind`와 무관하게 OfficeView를 보여 준다(3D 모델과 같은 방식). 본문이 보이면 항상 "데이터 미리보기이며 실제 문서 화면과 다릅니다" 안내, 일부만 보여 주면 "첫 부분만 표시합니다" 안내도 추가, 읽기 실패·너무 큼은 기존 스타일의 안내 문구. (depends: S3) — 완료 기준: `office-preview.test.tsx`가 FakeBackend로 세 형식의 본문 표시, 두 안내 문구(항상 나오는 "실제와 다름"과 잘렸을 때의 "첫 부분만"), 20MB 초과 안내, 읽기 실패 안내를 확인한다
- [ ] S5. 문서 갱신 — `docs/01-feature-spec.md` VIEW-01 행에 Office 문서 미리보기(첫 부분만, 디스크 파일만, 지원 확장자, 실제 화면과 다르다는 안내) 문장을 추가한다. — 완료 기준: DoD 5의 `grep`이 VIEW-01 행에서 통과한다
