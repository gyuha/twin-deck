<!-- forge-slug: transfer-two-progress-bars -->
<!-- task: 130 -->
<!-- tdd: off -->
# 복사·이동 진행 창에 현재 파일 막대와 전체 개수 막대를 함께 보여 준다

## 목표 / 하지 않을 것
- 목표: 복사·이동 진행 창이 막대 2개를 보인다. 위는 지금 처리 중인 파일의 바이트 진행(`12.3 MB / 80.0 MB`), 아래는 전체 진행(처리한 파일 수 / 전체 파일 수, `1/5개`). 파일이 1개이면 전체 막대는 없고 현재 파일 막대 1개만 보인다.
  - 현재 동작(코드로 확인, [높음]): `ui/Dialog.tsx`의 진행 창은 파일이 1개이고 바이트를 알 때만 바이트 막대를 보이고, 그 외에는 개수 막대 1개뿐이다. 백엔드(`JobInfo`의 `bytesDone/bytesTotal/filesDone/filesTotal`)는 이미 둘 다 준다.
  - 집계 직후 현재 파일의 바이트를 아직 모르면 현재 파일 막대는 빈 막대(진행 표시)로 자리를 지킨다(레이아웃이 튀지 않게).
  - 전체 파일 수를 모르면(`filesTotal === null`) 지금처럼 "집계 중…"이다.
- 하지 않을 것: Rust·`td-queue`·`packages/ts-client` 생성 바인딩 변경 · 삭제·휴지통·압축·풀기 진행 창(막대 1개 그대로) · 큐 팝업(`Queue.tsx`) · 설정 키 추가
- 변경 파일 예상: `apps/desktop/src/ui/Dialog.tsx`, `apps/desktop/src/i18n/ko.ts`·`en.ts`(새 문구가 필요하면 양쪽), `apps/desktop/src/__tests__/transfer.test.tsx`(바뀌는 기존 테스트 + 새 테스트)

## 기준 문서
- 용어: `.forge/CONTEXT.md`의 "전송"
- 관련 ADR: 없음
- 갱신할 문서: `docs/07-ui-spec.md`의 진행 창 설명(있으면)
- 완료 정의(DoD) = `.forge/loop.md`의 C1~C5
  1. 막대 2개: `bunx vitest run src/__tests__/transfer.test.tsx -t "막대 2개"` 통과 ≥ 1 (사전 상태: 0건 — 앞으로 가는 확인)
  2. 막대 1개: `-t "막대 1개"` 통과 ≥ 1 (사전 상태: 0건)
  3. 이동: `-t "이동 막대"` 통과 ≥ 1 (사전 상태: 0건)
  4. 회귀 방지(이미 통과 중): vitest 전체 기준선 소음만, `tsc` 통과
  5. 회귀 방지(이미 비어 있음): Rust·생성 바인딩 diff 없음, ko/en 키 일치

## 작업 조각
- [ ] S1. `Dialog.tsx` 진행 창: 파일 2개 이상(또는 개수 막대를 보일 조건)이면 현재 파일 바이트 막대 + 전체 개수 막대, 1개이면 바이트 막대만. 새 문구가 필요하면 `ko.ts`·`en.ts` 양쪽에. — 완료 기준: DoD 1~3의 화면 동작
- [ ] S2. 테스트: 기존 "파일이 2개 이상이면 N/M개를 유지한다"를 새 동작에 맞게 고치고 "막대 2개"·"막대 1개"·"이동 막대" 테스트를 더한다. (depends: S1) — 완료 기준: DoD 1~3
- [ ] S3. 문서: `docs/07-ui-spec.md`에 진행 창 설명이 있으면 갱신. (depends: S1) — 완료 기준: `grep -c "현재 파일" docs/07-ui-spec.md` ≥ 1 (설명이 없으면 이 조각은 건너뛰고 run.md에 적는다)
