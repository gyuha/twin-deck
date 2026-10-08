<!-- forge-slug: i18n-5of5-finish -->
<!-- task: 122 -->
<!-- part: 5/5 -->
<!-- tdd: off -->
# 영어 번역을 마무리하고 최종 검사와 문서를 갖춘다 (이슈 #32 5/5)

## 목표 / 하지 않을 것
- 목표: allowlist를 **빈 목록**으로 만들고(`jq 'length' apps/desktop/src/i18n/allowlist.json` → 0), 영어 번역의 어색한 부분(자리표시자 누락, 직역)을 다듬고, `docs/06-config-plugins.md`에 `behavior.language`를 설명하고 docs/07 설정 화면 설명에 언어 선택을 적는다. 영어 전체 화면 검사(`i18n-english-screens.test.tsx`)의 대상 화면을 대화상자 종류별로 넓힌다. CHANGELOG에는 쓰지 않는다(릴리스 때 쓴다).
- 하지 않을 것: README·docs 번역, 새 언어 추가, Rust 로직 변경(화면에 보이는 오류를 오류 종류로 바꾸는 것만 4/5에서 허용), 기존 테스트 기대값 약화(기존 테스트는 한국어 기본으로 그대로 통과해야 한다)

## 기준 문서
- 용어: 새 용어 없음. 관련 ADR: 없음(되돌리기 쉬운 문구 작업, 설계는 1/5의 run.md에 기록)
- 이 계획은 `.forge/loop.md`(이슈 #32 목표 계약)의 구성 작업이다. 공통 약속: 사전 키는 `영역.이름` 형태이고 한국어 사전(`i18n/ko.ts`)이 원본이다. 영어 사전(`i18n/en.ts`)에는 한글을 쓰지 않는다. 문구를 옮길 때 한국어 값은 **원래 문장 그대로**(기존 테스트가 이를 비교한다), 영어는 자연스러운 UI 영어로 쓴다. 매개변수는 중괄호 자리표시자를 쓴다.
- 완료 정의(DoD):
  1. `jq 'length' apps/desktop/src/i18n/allowlist.json` → 0 이고 `i18n-no-hardcoded.test.ts` 통과. 사전 상태: 앞선 계획이 끝난 뒤 값을 확인한다(남아 있으면 이 계획이 마저 옮긴다).
  2. `i18n-keys.test.ts`, `i18n-english-screens.test.tsx`, `i18n-setting.test.tsx` 통과. 자리표시자 검사: 모든 키에서 ko와 en의 자리표시자 집합이 같다(테스트에 추가).
  3. `grep -c 'behavior.language' docs/06-config-plugins.md` ≥ 1 (사전 상태 0)
  4. 회귀: tsc, vitest 실패 파일 기준선 2개, cargo test·clippy 통과

## 작업 조각
- [ ] S1. 남은 한글 이전과 allowlist 비우기, 자리표시자 검사 추가 — 완료 기준: DoD 1·2
- [ ] S2. 영어 문구 다듬기와 화면 검사 확대 — 완료 기준: DoD 2
- [ ] S3. 문서 갱신(docs/06·07) — 완료 기준: DoD 3 (depends: S1)
