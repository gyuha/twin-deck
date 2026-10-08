# 01. 기능 명세 (Marta 패리티)

Marta의 기능 목록을 twin-deck 관점에서 정리한 표다. Marta는 macOS 전용의 폐쇄 소스 앱이라 1차 근거는 공개 문서(https://marta.sh/docs/)와 API 문서(https://marta.sh/api/)다. 기능은 자체 표현으로 적었고, 문서 문장은 복사하지 않았다.

## 읽는 법

- **우선순위**: P0 = MVP(M1), P1 = 패리티 핵심(M2), P2 = 고급 기능(M3), P3 = 커스터마이징/확장(M4). 마일스톤은 [11-roadmap.md](11-roadmap.md) 참고.
- **근거**: Marta 문서 경로. `3rd`는 서드파티 자료에서만 확인, `미확인`은 문서로 확인하지 못함.
- **OS 대응**: macOS 전용 기능의 Windows/Linux 대체 방식. 상세는 [09-platform-support.md](09-platform-support.md).

우선순위는 사용 빈도와 다른 기능의 선행 조건 여부로 twin-deck이 정했다. Marta가 정한 것이 아니다.

## 1. 패널, 탭, 창

Marta의 중심 모델은 "활성 패널이 source, 비활성 패널이 target"인 듀얼 패널이다. 파일 작업의 방향이 이 모델에서 나오므로 모든 파일 작업 명세가 여기에 의존한다.

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| PANE-01 | 두 패널, Tab 키로 활성 패널 전환 | `/docs/` | P0 | 활성 패널을 시각적으로 구분 |
| PANE-02 | 패널별 탭 | 홈 | P0 | 탭마다 위치/표시 모드/정렬/선택/이력 보유 |
| PANE-03 | 다중 창 | 홈 | P1 | Tauri 멀티 윈도우 |
| PANE-04 | 탭 단축키 (새 탭, 닫기, 이동) | 3rd (Cmd+T, Cmd+W, Opt+Cmd+←/→) | P0 | 액션으로 정의, 키는 자체 지정 |
| PANE-05 | 재시작 시 탭, 창, 폴더, 선택, 터미널 높이, Actions Panel 검색어 복원 | `/docs/other/reset/` | P1 | 상태 스냅샷 저장. "Reset State" 액션 제공 |
| PANE-06 | 가상 탭 (Disk Usage 결과 등) | `/docs/actions/disk-usage/` | P2 | 위치가 없는 탭 타입 |
| PANE-07 | Action Bar (하단 버튼 줄, 단축키 표시) | `/docs/core/actions/` | P1 | 설정으로 끌 수 있음 (`layout.show_action_bar`) |

## 2. 탐색

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| NAV-01 | 방향키, Home/End, PageUp/PageDown 이동 | `/docs/navigation/` | P0 | |
| NAV-02 | Opt+PageUp/PageDown 반 페이지 스크롤 | `/docs/navigation/` | P1 | Alt로 매핑 |
| NAV-03 | Return/더블클릭으로 열기, Backspace·←·경로 표시줄 조각 클릭으로 상위 이동 (`..` 줄은 두지 않는다) | `/docs/navigation/base/` | P0 | |
| NAV-04 | Open With… | `/docs/navigation/` | P2 | OS별 앱 목록/실행 ([09](09-platform-support.md)) |
| NAV-05 | 다중 컬럼 모드에서 좌우 이동 | `/docs/navigation/` | P1 | |
| NAV-06 | 순환 선택, 우클릭 선택, Quick Select 접두 일치/아무 문자 활성화 옵션 | `/docs/navigation/` | P1 | 설정 키로 제공 |
| NAV-07 | Volumes 메뉴, 언마운트/추출 | `/docs/navigation/volumes/` | P1 | OS별 볼륨 감지 |
| NAV-08 | Favorites (추가/편집, 숫자키 선택, 구분선, 중첩 그룹) | `/docs/navigation/favorites/` | P1 | 설정 파일과 UI 편집 |
| NAV-09 | Recent Locations (탭별, 탭 닫으면 삭제, 비우기 액션) | `/docs/navigation/recent/` | P1 | |
| NAV-10 | Hierarchy (루트까지의 상위 목록) | `/docs/navigation/hierarchy/` | P1 | 브레드크럼과 동일 정보 |
| NAV-11 | Go To Path (Tab 완성, 아카이브 안에서는 `/`가 아카이브 루트) | `/docs/actions/` | P1 | |
| NAV-12 | 브레드크럼 | 볼륨/폰트 페이지 | P0 | |

## 3. 선택

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| SEL-01 | 전체 선택, 선택 해제(Esc) | `/docs/navigation/` | P0 | |
| SEL-02 | Shift+이동으로 범위의 선택 반전 | `/docs/navigation/` | P0 | Marta 방식(반전)을 따름. 일반적인 "범위 확장"과 다르므로 설정으로 전환 가능하게 할지 결정 필요 |
| SEL-03 | 선택 반전, 현재 항목 반전 | `/docs/navigation/` | P1 | 액션 |
| SEL-04 | Select Group / Deselect Group (패턴 선택) | `/docs/navigation/` | P1 | glob 패턴 입력. 패턴 문법은 문서로 확인 못함 `[알 수 없음]` |
| SEL-05 | Quick Select (입력하면 이동, 부분 일치/정규식) | 홈 | P0 | 입력 UI는 [07](07-ui-spec.md) |

## 4. 파일 작업

Marta의 기본 키는 Total Commander 계열(F5 복사, F6 이동 등)을 따른다. 아래 키는 Marta 문서에 명시된 기본값이며, twin-deck의 OS별 키는 [05](05-actions-keybindings.md)에서 정한다.

| ID | 기능 | Marta 기본 키 | 우선 | 비고 |
|---|---|---|---|---|
| OP-01 | 새 폴더 (중첩 경로 지원) | F7 | P0 | |
| OP-02 | 새 파일 (0바이트) | Shift+F7 | P0 | |
| OP-03 | 복사 | F5 | P0 | 비활성 패널로 복사 |
| OP-04 | 이동 | F6 | P0 | |
| OP-05 | 이름 변경 | Shift+F6 | P0 | |
| OP-06 | 휴지통으로 이동 | F8 | P0 | OS별 휴지통 |
| OP-07 | 영구 삭제 | Shift+F8 | P0 | 확인 대화상자 |
| OP-08 | 복제 (이름에 접미사 추가) | Cmd+D | P1 | |
| OP-09 | 편집 / 폴더 편집 | F4 / Shift+F4 | P1 | 편집기 앱은 설정 |
| OP-10 | 비활성 패널로 복사/이동 (대화상자 없음) | 기본 키 없음 | P1 | |
| OP-11 | 압축, 추출 | 기본 키 없음 | P2 | [08](08-vfs-file-ops.md) |
| OP-12 | 심볼릭 링크 만들기 | 문서에 언급, 키 미확인 | P2 | Windows는 권한 이슈 ([09](09-platform-support.md)) |
| OP-13 | 삭제/휴지통 확인 대화상자 on/off | 설정 키 | P1 | |
| OP-14 | 파일 정보 | Cmd+I | P1 | |
| OP-15 | 폴더 경로 복사 / 파일 경로 복사 | F12 / Cmd+F12 | P1 | |
| OP-16 | 파인더(파일 관리자)에서 보기 | 액션 | P1 | OS별 |
| OP-17 | 숨김 파일 표시 | Cmd+Shift+. | P0 | Windows/Linux 정의 다름 ([09](09-platform-support.md)) |

## 5. 작업 큐

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| Q-01 | 오래 걸리는 작업을 순차 실행 | `/docs/core/operation-queue/` | P1 | `sd-task-system` 기반 |
| Q-02 | 창 오른쪽 위 진행 표시, 클릭 시 작업별 상세와 중지 | 같음 | P1 | |
| Q-03 | 큐 키보드 조작: `=` 열기, 방향키/Space 이동, P 일시정지, A 또는 D 중단 | 같음 | P1 | |

## 6. 검색과 보기

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| FIND-01 | Look Up: 전역(Cmd+P), 현재 폴더(Cmd+Opt+P) | `/docs/actions/lookup/` | P2 | Marta는 Spotlight 기반. 3개 OS 공통 구현은 라이브 검색 ([08](08-vfs-file-ops.md)) |
| FIND-02 | 간단 조건: Folder, File, Archive, Disk Image, Text, RTF, HTML, XML, Source Code, Image, Video, Audio, Executable, Application, Bundle, ZIP | 같음 | P2 | 확장자/MIME로 판별. OS 의존 항목(Bundle, Application)은 macOS 한정 |
| FIND-03 | 복합 조건 `변수 연산자 인수` (Author, Name, Content, Title, UTI, Album, Genre 등) | 같음 | P2 | 메타데이터 필드는 macOS Spotlight 전용 항목이 많아 공통 필드(Name, Content, 크기, 날짜, 종류)부터 |
| FIND-04 | 연산자 `=`, `==`, `is`, `equals`, `!=`, `isNot`, `contains`, `has`, `like`, `~=`, `startsWith`, `endsWith` | 같음 | P2 | 별칭 그대로 수용 |
| FIND-05 | Flatten (하위 전체를 평면 목록으로) | `/docs/actions/flatten/` | P2 | |
| FIND-06 | Analyze Disk Usage (하위 폴더 크기, 크기 내림차순, 가상 탭, 아카이브 안에서도 동작) | `/docs/actions/disk-usage/` | P2 | |
| VIEW-01 | 미리보기 (Space 또는 Cmd+Y) | 홈/키맵 | P1 | Quick Look 사용 여부는 미확인. 앱 내 미리보기로 구현. 폴더는 하위 항목을 ASCII 트리(`├── └── │`, 폴더 먼저·이름순, 깊이 3·200줄 상한)로 보여 준다. 3D 모델(GLB·GLTF·OBJ·FBX·STL·3MF·PLY·STEP/STP·IGES/IGS·USDZ·GCODE)은 three.js로 렌더링하며(회전·확대, Draco 압축 glTF 포함, 로더는 지연 로드) 확장자로 고른다. Office 문서(docx·xlsx·pptx)는 설정 `preview.office`(기본 꺼짐, 켜면 미리보기를 보여 주고 끄면 "미리 볼 수 없는 형식"처럼 다룬다)를 켰을 때만, 디스크 위 파일만 첫 부분(docx 앞 100블록, xlsx 첫 시트 앞 100행, pptx 첫 슬라이드 텍스트)을 보여 주고 20MB를 넘으면 읽지 않으며, 상단 가운데에 "데이터 미리보기이며 실제 문서 화면과 다릅니다"를 항상 표시한다 |

## 7. 아카이브

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| ARC-01 | ZIP 계열 읽기/쓰기: zip, jar, war, aar, apk, nupkg, klib, sublime-package | `/docs/advanced/archive/` | P2 | 추가 확장자를 설정으로 등록 (`file_systems.zip.additional_extensions`) |
| ARC-02 | 읽기 전용: tar, tar.gz, tgz, tar.bz2, rar(제약 있음), xar, cab, shar, lzh/lha, cpio, iso, rpm, ar | 같음 | P2 | 우선 tar 계열과 rar. 나머지는 라이브러리 지원 여부에 따라 결정 `[알 수 없음]` |
| ARC-03 | 중첩 아카이브 열기/편집, 열어 둔 파일 변경이 아카이브에 자동 반영 | 같음 | P2 | 임시 추출 + 감시 + 되쓰기 ([08](08-vfs-file-ops.md)) |
| ARC-04 | "Open As"로 임의 파일을 아카이브로 열기 | 같음 | P2 | |

암호, 인코딩, 압축 옵션은 Marta 문서에 없어 twin-deck도 1차 범위에서 제외한다.

## 8. 터미널, CLI

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| TERM-01 | 내장 터미널: 열기/포커스, 표시 토글, Ctrl+D로 종료 | `/docs/advanced/terminal/` | P2 | |
| TERM-02 | 패널마다 별도 pty, 상태 표시줄 아래, 숨겨도 계속 실행 | 같음 | P2 | `portable-pty` + xterm.js |
| TERM-03 | 터미널 cwd와 패널 위치의 양방향 동기화 (중첩 셸/ssh 제외) | 같음 | P2 | 셸 통합 방식은 OS/셸별 검증 필요 `[낮음]` |
| TERM-04 | 터미널 테마, 폰트, 셸, 환경 변수 설정 | 같음 | P2 | |
| TERM-05 | 외부 터미널 실행 (F11) | 같음 | P2 | OS별 기본 터미널 |
| CLI-01 | `twin-deck .` / `twin-deck a b` (두 경로를 두 패널로), `--existing-tab`, `--new-window` | `/docs/advanced/cli/` | P2 | 실행 파일 심볼릭 링크 대신 설치기가 PATH 등록 |

## 9. 커스터마이징

| ID | 기능 | 근거 | 우선 | twin-deck 방식 |
|---|---|---|---|---|
| CFG-01 | 설정 파일과 내장 편집기 (좌: 읽기 전용 기본값, 우: 사용자 값) | `/docs/configuration/` | P3 | TOML ([06](06-config-plugins.md)) |
| CFG-02 | 키바인딩 (수정자, 인수, 해제 `null`) | `/docs/configuration/hotkeys/` | P1 | |
| CFG-03 | 테마: 5종 내장(Kon, Dark, Classic, Sakura, Commander), 사용자 정의, 즉시 미리보기 | `/docs/configuration/themes/` | P1 | 라이트/다크 먼저. 5종 재현은 P3 |
| CFG-04 | 폰트: Action Bar, 브레드크럼, 가상 탭, 파일 목록, 상태 표시줄, 표 헤더, 탭, 환경설정 | `/docs/configuration/fonts/` | P2 | CSS 변수 |
| CFG-05 | 표시 옵션: 아이콘 크기, 상대 날짜, 날짜/시간 포맷(strftime), 크기 표기(adaptive, KB…TiB) | `/docs/configuration/` | P1 | |
| CFG-06 | 컬럼 명세 `[<|>]이름[:너비]` (size, created, modified, added, extension, 권한 2종) | `/docs/core/columns/` | P1 | [07](07-ui-spec.md) |
| CFG-07 | 표시 모드: Table, 다중 컬럼(1~3), 패널별 | `/docs/core/display-modes/` | P1 | |
| CFG-08 | 정렬(Ordering 액션). 인수 미확인 | `/docs/core/` | P1 | 자체 정의 |
| CFG-09 | Gadgets: application/executable 유형, 선택/폴더 변수 | `/docs/advanced/gadgets/` | P3 | [06](06-config-plugins.md) |
| CFG-10 | Lua 플러그인 (액션 정의, `isApplicable`, `apply`, 컨텍스트 객체) | `/api/` | P3 | ADR-0008 (Proposed) |
| CFG-11 | 튜토리얼(첫 실행), 상태 초기화 | `/docs/tutorial/` | P2 | |
| CFG-12 | 설정 화면: 값 하나짜리 설정을 항목별 컨트롤로 바꾸고 즉시 저장, 항목별 기본값 복원 (`Mod+,`) | twin-deck 자체 | P1 | 구현됨(2026-10-01). 배열·키바인딩 편집과 TOML 편집기(CFG-01)는 아직 |

## 10. 액션 시스템

액션이 모든 실행의 공통 진입점이다. 실행 경로는 키 바인딩, Action Bar, Actions Panel(Cmd+Shift+P, 이름 퍼지 검색), 플러그인이다. 상세 모델과 카탈로그는 [05](05-actions-keybindings.md)에 있다.

| ID | 기능 | 우선 |
|---|---|---|
| ACT-01 | Actions Panel: 퍼지 검색, Return 실행, Opt 누르면 ID 표시 | P1 |
| ACT-02 | 컨텍스트 조건부 활성 (예: 편집은 선택이 있어야 함) | P0 |
| ACT-03 | 액션 인수 (`Alt+H` → `core.open.directory`, `src="~"`) | P1 |
| ACT-04 | 다른 액션을 호출하는 Run Action. ID와 문법 미확인 | P3 |

## 11. 범위 밖으로 남기는 Marta 항목

| 항목 | 이유 |
|---|---|
| Marco 형식 | ADR-0006 |
| `.ettyTheme` 터미널 테마 형식 | xterm.js 테마로 대체 |
| Swift/ObjC 상호운용, Lua C API 연동 | 스택 불일치 |
| macOS `.app` 번들 인식(`isApplication`) | macOS 한정. Application 조건은 macOS에서만 활성 |

## 12. 미확인 과제

| 항목 | 확인 방법 |
|---|---|
| Marta의 내장 액션 ID 전체, 기본 키맵 | Marta 설정 편집기의 읽기 전용 기본값 확인 |
| Select Group의 패턴 문법 | Marta 실행 확인 |
| Ordering, Display Mode, Show Hidden Files 액션의 인수 이름 | Marta 실행 확인 |
| Quick Look 사용 여부 | Marta 실행 확인 |
| 원격 파일시스템 지원 여부 | Marta 실행 확인 |
| Lua API 전체 표면(클래스/함수 문서) | 접근 가능한 API 문서 재조사 |
