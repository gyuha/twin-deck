# 실행 기록 — store.ts 문구 이전 (이슈 #32 2/5)

직접 처리했다.

## 조각별 결과
- S1 store.ts 문구를 사전으로 — ✅ 124개 키(`store.*`, `ctx.*`). 한국어는 원문 그대로. 컨텍스트 메뉴 `CONTEXT_MENU`는 `get label()` 게터라 그릴 때 현재 언어를 읽는다. 모듈 상수 `VIRTUAL_NO_*`는 함수로 바꿨다. `store.ts`의 지역 변수 `t`와 겹쳐 import를 `t as tr`로 썼다. 콘솔 로그 한 줄도 사전에 넣었다(한국어 모드에서 같은 글자)
- S2 영어 렌더링 테스트 — ✅ `i18n-store-messages.test.tsx` 3건. ⚠ 대화상자 컴포넌트의 고정 글자(버튼·안내)가 아직 한국어라(3/5), 이 테스트는 store가 만든 제목·본문만 본다. 전체 한글 없음은 3/5의 `i18n-english-screens`가 본다

## DoD
1. allowlist에서 `state/store.ts` 제거(43→42개), `i18n-no-hardcoded` 통과 2. 새 테스트 3건 3. tsc 통과, vitest 실패 파일 기준선 2개(1063건 통과), i18n-keys 통과

## 도구
- 문구 이전은 줄 번호 기반 일회성 스크립트로 했다(저장소에 넣지 않음). 사전 항목 추가용 `/tmp/adddict.py`는 키가 있으면 건너뛴다.
