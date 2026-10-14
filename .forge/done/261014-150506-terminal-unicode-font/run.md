# 실행 기록 — 터미널 한글 출력과 글꼴 간격 (이슈 #61)

- S1 PTY 환경 — locale 없는 GUI 환경과 C/POSIX 기본값을 자식 프로세스에서 UTF-8로 보완했다. 명시한 지역·기존 인코딩은 보존한다.
- S2 글꼴 적용 — 사용자 글꼴 뒤에 고정폭 fallback을 추가하고 로드 후 폭을 측정한다. 변경 시 다시 맞추며 오래된 비동기 요청과 해제 후 갱신을 막는다. 설정 설명·문서를 갱신했다.
- S3 검증 — 실제 PTY 파일명 출력, Chromium xterm 렌더링, 자동 회귀 검사를 수행했다.

## 기준값과 실제 화면
- 실제 PTY ls에서 LC_ALL=C는 한글폴더를 물음표 12개로 출력했다. UTF-8 환경은 원문을 보존했다. 수정 후 locale 없음·LANG/LC_CTYPE/LC_ALL=C 각각에서 NFC·NFD 파일명 보존 테스트 통과.
- 760px xterm 폭: 기본 95칸, 실제 Jetendard 95칸, 실제 Wanted Sans 55칸, 없는 글꼴 fallback 95칸. 수정 전 없는 사용자 글꼴은 비고정폭으로 대체돼 67칸이었다.
- 공식 웹폰트를 /tmp에 내려받아 검증 페이지에만 로드했다. 시스템에는 설치하지 않았다.
- 기본→Wanted Sans→기본 변경은 95→55→95칸으로 복원하고 한글 출력도 유지했다. 2바이트 UTF-8 청크, 분해형 한글, 600px 크기 변경도 확인했다.
- 화면 증거: /tmp/twin-deck-61-browser-final.png. 브라우저 공간과 임시 Vite 서버는 종료했다.

## 검증과 차이
- cargo test -p td-terminal: 13개 통과(기존 10개).
- cargo clippy -p td-terminal -- -D warnings, cargo fmt --all -- --check, git diff --check 통과.
- bun run typecheck: 모든 패키지 통과.
- 전체 JS 검사는 첫 실행에서 글꼴 로드 표본을 UI 문구로 인식해 1개 실패했다. 비표시 표본을 유니코드 이스케이프로 표현해 검사 규칙과 실제 글리프를 보존했다. 자동 수정 1/3회.
- 실제 macOS PTY와 Chromium xterm을 검증했다. 네이티브 WKWebView 화면·Windows 실행은 검증하지 않았다.
- Wanted Sans의 비고정폭 간격은 터미널 칸 구조상 남는다. 고정폭 글꼴 권장을 설명하고 사용자 선택을 보존한다.
- 기존 터미널은 새로 열어야 보완된 locale이 적용된다. 셸 초기화 파일이 locale을 다시 설정하는 경우까지 덮어쓰지 않는다.

## 후속 학습 후보
- 한글 물음표 출력은 렌더러보다 PTY locale과 실제 출력 바이트를 먼저 비교한다.
- 사용자 CSS 글꼴 목록에는 고정폭 fallback을 두고 글꼴 로드 완료 후 터미널 폭을 측정한다.

- 최종 전체 JS 검사: 163개 파일·1,380개 테스트 전부 통과 (/tmp/twin-deck-61-tests-final.log).
