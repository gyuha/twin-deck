; Tauri NSIS 설치 파일 훅(이슈 #45). 설치 뒤 앱을 한 번 실행해 `td` 명령(`td.cmd` + 사용자 PATH)을 설치하고,
; 제거 전에 같은 방법으로 지운다. PATH·td.cmd를 만드는 논리는 앱 안(`td-cli` 크레이트)에 있고 단위 테스트로 확인되어 있다.
; 앱은 이 플래그를 받으면 창을 만들지 않고 설치·제거만 한 뒤 끝난다.

!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --td-install-cli'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --td-uninstall-cli'
!macroend
