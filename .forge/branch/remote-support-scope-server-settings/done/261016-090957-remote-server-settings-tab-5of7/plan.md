<!-- forge-slug: remote-server-settings-tab-5of7 -->
<!-- task: 182 -->
<!-- part: 5/7 -->
<!-- tdd: off -->
# 설정 "연결 > Twin Deck Remote" 탭 (5/7)

## Goal / Non-goals
- Goal: 설정의 연결 그룹에 `Twin Deck Remote` 탭을 추가한다. 서버 영역(켜기·끄기 스위치, 수신 주소·포트, 루트 폴더, 쓰기 허용·셸 허용, 비밀번호 설정, 현재 접속 주소와 호스트키 지문 표시)과 접속 주소 영역(`remote.servers`의 `protocol = "twindeck"` 항목 목록 + 선택 항목 편집 폼, 추가·수정·삭제)을 둔다. `protocol`에 `twindeck`을 추가하고 클라이언트는 SFTP와 같은 경로로 연결한다.
- Non-goals: 원격 터미널 열기(6/7), 클라이언트 호스트키 검증.

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0019-remote-fs-in-process.md
- Definition of Done: `cd apps/desktop && bunx vitest run src/__tests__/twin-deck-remote.test.tsx` 통과(서버 켜기·끄기가 Backend 호출로 이어짐, 주소 추가·수정·삭제), 설정 탭 목록 테스트 갱신 후 `bunx vitest run` 전체 통과, tsc 통과. 서버가 켜져 있는데 비밀번호가 비어 있으면 켜지 못하게 하고 이유를 보인다. UI 글자는 한글(i18n 사전)이다.

## Work slices
- [ ] S1. 서버 영역 UI와 store 연결 — 완료 기준: 켜기·끄기 테스트 통과.
- [ ] S2. 접속 주소 목록·편집 UI, `twindeck` 프로토콜 값 — 완료 기준: 추가·수정·삭제 테스트 통과(depends: S1).
- [ ] S3. 탭 등록(SECTIONS, 그룹 count, i18n) — 완료 기준: 탭 목록 테스트 통과.
