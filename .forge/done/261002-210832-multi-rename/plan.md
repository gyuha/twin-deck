<!-- forge-slug: multi-rename -->
<!-- task: 7 -->
<!-- tdd: off -->
# 다중 이름 바꾸기 도구

## 목표 / 비목표
- 목표: 2개 이상 선택하고 Shift+F6(또는 컨텍스트 메뉴 "이름 바꾸기")을 누르면 다중 이름 바꾸기 창을 연다. 파일 이름 마스크 `[N]`/`[E]`/`[C]`, 확장자 마스크, 대소문자 변환, 찾기·바꾸기(정규식·대소문자·1x), 카운터를 쓰고 표로 실시간 미리본다. 충돌은 막고, 맞바꾸기는 임시 이름을 거쳐 처리한다.
- 비목표: 프리셋, 구성, 로그 결과, 날짜 토큰, 되돌리기, Rust 변경.

## 기준 문서
- 용어집: 없음 · 관련 ADR: 없음
- 완료 정의(DoD): `.forge/loop.md`의 종료 조건 C1~C6 전부 통과.
  1. `multi-rename-names.test.ts`, `multi-rename.test.tsx` 통과 (사전: 파일 없음, 전진 확인)
  2. `bunx vitest run` 실패 0, `bun run typecheck` 0, `cargo test --workspace` 실패 0 (회귀 방지)
  3. 실제 앱(UAT): 여러 파일을 선택해 이름을 바꿔 보는 것은 사람이 확인한다.

## 작업 조각
- [ ] S1. 순수 함수(`buildNewNames`, `validateNames`, 실행 계획) — 완료 기준: DoD 1의 names 테스트 통과.
- [ ] S2. 다이얼로그 상태·UI·액션·진입점 — 완료 기준: DoD 1의 화면 테스트 통과. (depends: S1)
- [ ] S3. 전체 회귀 확인 — 완료 기준: DoD 2. (depends: S2)
