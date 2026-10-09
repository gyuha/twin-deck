# 실행 기록 — 디스크 PDF 파일 주소로 직접 열기 시험 (#124)

직접 처리했다.

## 조각별 결과
- S1 td-config `preview.pdf_direct`(기본 false) + 테스트 — ✅
- S2 Service가 스위치를 들고 `apply_config`가 갱신(#123의 한도와 같은 경로). 켜짐+디스크 PDF는 파일을 읽지 않고 `kind pdf`·`data_url None`·`truncated false`, 한도 무시 — ✅ 테스트 2건(켜짐은 11MB도 읽지 않음, 꺼짐은 지금처럼 `truncated`, 압축 안 PDF는 영향 없음)
- S3 gen-types, `PdfView`(`fileSrc` 분기: Blob·fetch·쪽 수 읽기 없음), `Preview`가 dataUrl 없고 truncated 아닐 때 `api.fileUrl(path)`를 줌, 설정 스위치(ko·en, 시험 안내), FakeBackend가 같은 동작, docs/06 — ✅ `pdf-direct.test.tsx` 3건
- S4 회귀 — ✅ (`coalesce_*`는 AGENTS.md에 적힌 타이밍 잡음으로 병렬에서 한 번 실패, 단독·재실행은 통과)

## DoD (기준선 → 실행 후)
1. td-config 테스트 없음 → 1건 통과 2. desktop `pdf_direct` 테스트 없음 → 2건 통과 3. vitest 파일 없음 → 3건 통과 4. tsc 통과, vitest 실패 파일 기준선 2개(1082건 통과), cargo 84건·clippy·fmt 통과, `pdf-preview`·`preview-scroll`은 꺼짐 기본에서 그대로
5. **실제 앱 확인: 사람이 할 차례**(아래)

## 실제 앱 확인 (DoD 5)
1. 설정 > 미리보기에서 "PDF를 파일 주소로 직접 열기 (시험)"를 켠다.
2. 큰 PDF(예: 100MB 이상)를 Space/→로 연다 → 열기 전 대기가 짧고 쪽이 보이는가.
3. PageDown/PageUp으로 쪽이 넘어가는가(쪽 수를 모르므로 끝을 넘어도 막지 않는다), 닫을 때 문제가 없는가.
4. 안 열리거나 쪽 이동이 안 되면 결과를 알려 주고 스위치는 끈다. Windows는 별도 기기.

## 확인하지 못한 가정
- WKWebView의 PDF 뷰어가 asset 주소의 PDF를 열고 `#page=N`이 동작하는지(비디오에서 asset 주소가 되는 것만 알려져 있다). jsdom은 이를 확인할 수 없다.
