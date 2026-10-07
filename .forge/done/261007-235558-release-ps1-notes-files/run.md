# RUN — release.ps1이 변경 사항을 파일로 넘겨 Windows에서 깨지지 않게 한다 (리뷰 F)

- S1 red 테스트 — ✅ `update-manifest.test.mjs`의 `--notes-file`(한글·큰따옴표·줄바꿈·`--` 포함 파일이 notes에 그대로 들어감)와 `release-notes.test.mjs`의 `--out`. 구현 전 2건 실패
- S2 구현 — ✅ `update-manifest.mjs --notes-file`(UTF-8, 끝 공백 제거), `release-notes.mjs --out`(node가 UTF-8 파일에 직접 씀). `release.ps1`은 노트를 PowerShell 변수·표준출력·명령줄 인수로 받지 않고 `--out`으로 만든 파일을 `--notes-file`로만 전달

## DoD baseline → after
1. 신규 테스트 2건: red → 통과, `bun test scripts/` 28 → 30건 통과
2. `grep -c -- '--notes $notesPlain' release.ps1`: 1 → 0, `notes-file` ≥ 1(2), `$notesBody`·`$notesPlain` 변수 제거

## 한계·메모 (중요)
- **`release.ps1`은 실행하지 못했다.** 이 환경에 PowerShell이 없어 node 쪽(`--notes-file`, `--out`)만 시험되었고 ps1 변경은 정적 검토뿐이다. Windows PowerShell 5.1에서 `node ... --out $path`가 인수를 제대로 받는지(경로 공백 포함), 종료 코드 확인이 동작하는지는 확인하지 않았다.
- 범위를 조금 넘었다: 계획은 `--notes-file`만 말했지만, 표준출력으로 받던 노트 본문(`notes.md`)의 한글 깨짐도 막으려면 `release-notes.mjs --out`이 필요해 함께 추가했다. `--out`이 없으면 기존처럼 표준출력이다(`release.sh`는 그대로 쓴다).
