# run — Twin Deck Remote 문서 (7/7)

- S1 ADR-0021 작성과 `docs/adr/README.md` 목록 — ✅ 범위·프로토콜·보안 결정·제외 항목(원격 압축·해제, 클라이언트 호스트키 검증)을 적었다
- S2 README.md·README.en.md 쌍 — ✅ 같은 위치(SFTP·FTP 연결 항목 바로 뒤)에 같은 내용을 넣었다. `docs/05-actions-keybindings.md`는 6/7에서 이미 갱신

DoD baseline → after:
- `ls docs/adr/0021-*.md` : 0개 → 1개
- `grep -c 'Twin Deck Remote' README.md` : 0 → 1 / README.en.md : 0 → 1
- `grep -c 0021 docs/adr/README.md` : 0 → 1
- README 두 파일 첫 줄 언어 링크 : 그대로(`**한국어** | [English](README.en.md)`, `**English** | [한국어](README.md)`)

발견: 서버 셸은 루트에 가두지 않는다(앱 실행 계정 권한). 3/7 때 의도한 동작이지만 위험하므로 ADR·README 양쪽에 명시했다. 6/7 run.md의 "서버 홈에서 시작"은 실제로는 서버의 루트 폴더에서 시작한다.
