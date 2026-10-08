# 실행 기록 — 최종 검사와 문서 (이슈 #32 5/5)

직접 처리했다.

## 조각별 결과
- S1 남은 한글 이전과 allowlist 비우기, 자리표시자 검사 — ✅ 앞선 작업에서 allowlist가 이미 `[]`였고 자리표시자 검사(`i18n-keys.test.ts`)도 1/5에 있었다. 이 작업에서 더한 것은 없다
- S2 영어 문구 다듬기와 화면 검사 확대 — ✅ 영어 화면 검사는 3/5·4/5에서 메인·설정 전 탭·도움말·액션 패널·작업 큐·새 폴더·삭제 확인·컨텍스트 메뉴·폴더/파일 미리보기·파일 찾기까지 넓어져 있다. 문구 다듬기는 따로 하지 않았다(생성 시 자연스러운 UI 영어로 썼다)
- S3 문서 — ✅ `docs/06`에 `behavior.language` 설정 줄과 6.9절, `docs/07` 설정 섹션 설명

## DoD
1. allowlist 0개, `i18n-no-hardcoded` 통과 2. i18n-keys 7·i18n-english-screens 6·i18n-setting 1·i18n-rust-messages 6 통과 3. `grep -c behavior.language docs/06-config-plugins.md` 0 → 3 4. tsc, vitest 실패 파일 기준선 2개(1076건 통과), cargo test 78건·td-config 32건·clippy·fmt 통과

## 남은 한계
4/5 run.md의 한계를 따른다: Rust 문구는 대응표 우회, 키 설정 경고 문구(`packages/keybinds`)와 일부 안내는 한국어, 사용자 파일 내용은 번역하지 않는다. 실제 앱(WKWebView·네이티브 메뉴) 확인은 하지 않았다.
