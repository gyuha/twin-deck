# RUN — Office 미리보기가 이전 파일의 크기로 상한을 판단하지 않게 한다 (리뷰 E)

- S1 red 테스트 — ✅ `office-stale-size.test.tsx` 2건. 구현 전 (a) 21MB docx를 새 데이터 전에 읽음(읽기 1회), (b) 크기가 다른 작은 docx를 오갈 때 이중 읽기(2회)로 실패
- S2 구현 — ✅ `Preview`가 `status: ready`일 때만 `OfficeView`·`ModelView`를 마운트(`fresh`), 로딩 중에는 "불러오는 중…", `OfficeView`의 fetch를 `AbortController`로 취소

## DoD baseline → after
1. 2건: red → 통과
2. 기존 office·model 미리보기 테스트: 통과 유지
3. vitest 831 → 833 통과(model-formats 기준선 1파일), tsc 0

## 차이·메모
- 항목을 넘기는 동안 Office·3D는 이전 내용을 흐리게 남기지 않고 "불러오는 중…"으로 바뀐다(텍스트·이미지 등은 예전처럼 흐리게 남는다).
- 실제 앱에서 빠르게 항목을 넘길 때의 체감은 확인하지 못했다.
