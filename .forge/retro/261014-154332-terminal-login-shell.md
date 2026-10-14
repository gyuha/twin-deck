# 2026-10-14 — 내장 터미널을 로그인 셸로 연다 (이슈 #64)

## 계획 대비 실제
- 계획대로 된 것: 테스트 먼저(red) → `resolve_shell`에 `-l` → 문서 세 곳 → clippy·fmt. 전부 한 번에 통과했다. 수정 전 통합 테스트 출력은 `P= R=from_rc`로, `.zprofile`만 빠지는 이슈 증상을 그대로 재현했다.
- 어긋난 것: 없음. 기준선에서 간헐 실패로 적어 둔 `exit_code_comes_as_an_exit_event`는 이번에는 한 번도 재현되지 않았다.

## 배운 점
- 다음에 다르게 할 것:
  - 보고자 환경(brew로 설치한 `zoxide`·`starship`)을 재현하지 못한 채 가설(비로그인 셸 → `.zprofile` 미적용 → PATH 부족)로 고쳤다. 자동 테스트는 `.zprofile` 적용까지만 증명한다. 이슈에 댓글을 달 때 앱 터미널과 일반 Terminal에서 `echo $PATH`와 `command -v zoxide starship lsd` 결과를 비교해 달라고 요청하면 가설을 확인할 수 있다.
  - `lsd` 색상 테마는 원인을 설명하지 못해 비목표로 뺐다. 배포 후 다시 확인을 요청해 닫히지 않으면 새 계획으로 다룬다.
  - 셸 시작 파일처럼 환경에 기대는 동작은 임시 `HOME`·`ZDOTDIR`에 표식 변수를 쓰는 파일을 두고 pty로 실제 셸을 띄워 검증하면 사용자 환경 없이도 테스트할 수 있다(`login_shell_loads_zprofile_and_zshrc`). 같은 방식을 다른 셸 환경 이슈에도 쓸 수 있다.

## 문서 갱신
- CONTEXT.md 승급: 없음
- ADR 추가: 없음
- 회귀 검사(eval): 이번 작업이 `crates/td-terminal`에 직접 추가한 테스트 2건(`resolve_shell_unix_args_are_login`, `login_shell_loads_zprofile_and_zshrc`)이 그 역할을 한다.
