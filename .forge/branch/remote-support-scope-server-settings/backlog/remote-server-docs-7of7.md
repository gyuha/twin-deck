<!-- forge-slug: remote-server-docs-7of7 -->
<!-- task: 184 -->
<!-- part: 7/7 -->
<!-- tdd: off -->
# Twin Deck Remote 문서: ADR-0021과 README 쌍 (7/7)

## Goal / Non-goals
- Goal: `docs/adr/0021-twin-deck-remote-server.md`에 범위·프로토콜(SSH/SFTP)·보안 결정(기본 꺼짐, 127.0.0.1, 비밀번호+영속 호스트키, 루트 가두기, 클라이언트 호스트키 미검증, 원격 압축·해제 제외)을 쓰고, `docs/adr/README.md` 목록과 `docs/05-actions-keybindings.md`(액션·키가 바뀐 경우), README.md·README.en.md 쌍을 같은 커밋에서 갱신한다.
- Non-goals: 코드 변경, CHANGELOG(배포 때 쓴다).

## Source of truth
- Glossary terms: none
- Related ADRs: docs/adr/0019-remote-fs-in-process.md, 0018
- Definition of Done: 아래 명령이 모두 실행되는 상태로 통과한다. `ls docs/adr/0021-*.md` 1개, `grep -c 'Twin Deck Remote' README.md` ≥ 1 이고 `grep -c 'Twin Deck Remote' README.en.md` ≥ 1, `grep -c 'twin-deck-remote\|0021' docs/adr/README.md` ≥ 1, README 두 파일 첫 줄의 언어 링크가 그대로다(`head -1`로 확인).

## Work slices
- [ ] S1. ADR-0021 작성과 목록 갱신 — 완료 기준: 파일과 목록 항목이 있다.
- [ ] S2. README.md·README.en.md·docs/05 갱신 — 완료 기준: 위 grep들이 통과한다(depends: S1).
